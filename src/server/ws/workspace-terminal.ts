/**
 * WebSocket Handler for Workspace Terminal Streaming
 *
 * Provides real-time bidirectional terminal I/O between the browser
 * and workspace containers via the bridge agent.
 *
 * Protocol:
 *   Upgrade: GET /ws/workspace/:containerId/terminal/:sessionId
 *   Auth: ?token=<JWT> query parameter
 *
 * Client → Server messages (JSON):
 *   { type: "input", data: "<text>" }        - Send terminal input
 *   { type: "resize", cols: N, rows: N }     - Resize terminal
 *   { type: "ping" }                         - Keep-alive
 *
 * Server → Client messages (JSON):
 *   { type: "output", data: "<text>" }       - Terminal output
 *   { type: "exit", code: N }                - Terminal session ended
 *   { type: "error", message: "<text>" }     - Error message
 *   { type: "pong" }                         - Keep-alive response
 *   { type: "connected" }                    - Successfully connected
 *
 * @module server/ws/workspace-terminal
 */

import { verifyToken } from '@/lib/jwt';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { bridgeClientManager } from '@/modules/workspace/bridge-client.service';
import { containerLifecycleService } from '@/modules/workspace/container-lifecycle.service';
import type { Server as HTTPServer, IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

const log = logger.child({ module: 'ws-terminal' });

// Message types from client
interface TerminalInputMessage {
  type: 'input';
  data: string;
}

interface TerminalResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

interface TerminalPingMessage {
  type: 'ping';
}

type ClientMessage = TerminalInputMessage | TerminalResizeMessage | TerminalPingMessage;

// Constants
const WS_PATH_REGEX = /^\/ws\/workspace\/([a-zA-Z0-9_-]+)\/terminal\/([a-zA-Z0-9_-]+)$/;
const HEARTBEAT_INTERVAL = 30_000;
const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB per message

/**
 * Initialize the WebSocket server for workspace terminals.
 * Attaches to the existing HTTP server via the 'upgrade' event.
 */
export function initWorkspaceWebSocket(httpServer: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  // Handle HTTP upgrade requests
  httpServer.on('upgrade', async (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const pathname = url.pathname;

    // Only handle workspace terminal WebSocket paths
    const match = pathname.match(WS_PATH_REGEX);
    if (!match) {
      // Not our path — let other upgrade handlers (if any) take it
      // If no one handles, the socket will just close
      return;
    }

    const containerId = match[1];
    const sessionId = match[2];
    const token = url.searchParams.get('token');

    if (!token) {
      log.warn({ pathname }, 'WebSocket upgrade rejected: no token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      // Verify JWT token
      const payload = verifyToken(token);
      if (!payload || !payload.userId) {
        throw new Error('Invalid token payload');
      }

      // Verify container ownership
      const container = await prisma.workspaceContainer.findUnique({
        where: { id: containerId },
      });

      if (!container) {
        log.warn({ containerId }, 'WebSocket upgrade rejected: container not found');
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      if (container.userId !== payload.userId) {
        // Platform admins can access any container
        const isPlatformAdmin = payload.role === 'ADMIN' || payload.role === 'SUPER_ADMIN';

        if (!isPlatformAdmin) {
          // Check if user is org member with access
          if (container.organizationId) {
            const membership = await prisma.membership.findUnique({
              where: {
                userId_organizationId: {
                  userId: payload.userId,
                  organizationId: container.organizationId,
                },
              },
              select: { status: true, role: true },
            });

            if (!membership || membership.status !== 'ACTIVE') {
              log.warn({ containerId, userId: payload.userId }, 'WebSocket upgrade rejected: not authorized');
              socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
              socket.destroy();
              return;
            }

            // Only org owners and admins can access other members' containers
            if (!['ORG_OWNER', 'ORG_ADMIN'].includes(membership.role)) {
              log.warn(
                { containerId, userId: payload.userId, orgRole: membership.role },
                'WebSocket upgrade rejected: insufficient org role for terminal access',
              );
              socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
              socket.destroy();
              return;
            }
          } else {
            log.warn({ containerId, userId: payload.userId }, 'WebSocket upgrade rejected: not owner');
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }
        }
      }

      if (container.status !== 'RUNNING') {
        log.warn({ containerId, status: container.status }, 'WebSocket upgrade rejected: container not running');
        socket.write('HTTP/1.1 409 Conflict\r\n\r\n');
        socket.destroy();
        return;
      }

      // Upgrade the connection
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, { containerId, sessionId, userId: payload.userId });
      });
    } catch (err) {
      log.error({ err, pathname }, 'WebSocket upgrade error');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // Handle new connections
  wss.on(
    'connection',
    (ws: WebSocket, _request: IncomingMessage, context: { containerId: string; sessionId: string; userId: string }) => {
      const { containerId, sessionId, userId } = context;
      log.info({ containerId, sessionId, userId }, 'Terminal WebSocket connected');

      let alive = true;

      // Track activity for idle detection
      containerLifecycleService.touchActivity(containerId);

      // Set up heartbeat
      const heartbeat = setInterval(() => {
        if (!alive) {
          log.warn({ containerId, sessionId }, 'Terminal WebSocket heartbeat failed');
          ws.terminate();
          return;
        }
        alive = false;
        ws.ping();
      }, HEARTBEAT_INTERVAL);

      ws.on('pong', () => {
        alive = true;
      });

      // Get bridge client for this container
      const bridgeClient = bridgeClientManager.getExistingClient(containerId);
      if (!bridgeClient) {
        sendError(ws, 'Bridge client not connected for this container');
        ws.close(1011, 'Bridge unavailable');
        clearInterval(heartbeat);
        return;
      }

      // Listen for terminal output from bridge
      // Bridge agent sends: { event: 'terminal.output', data: { sessionId, output: '...' } }
      // Note: the bridge uses 'output' not 'data' as the key for terminal content
      const onTerminalOutput = (data: { sessionId: string; output: string }) => {
        if (data.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'output', data: data.output }));
        }
      };

      const onTerminalExit = (data: { sessionId: string; code?: number; exitCode?: number }) => {
        if (data.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'exit', code: data.exitCode ?? data.code ?? 0 }));
          ws.close(1000, 'Terminal exited');
        }
      };

      bridgeClient.on('terminal.output', onTerminalOutput);
      bridgeClient.on('terminal.exit', onTerminalExit);

      // Send connected confirmation
      ws.send(JSON.stringify({ type: 'connected', sessionId }));

      // Handle messages from client
      ws.on('message', async (rawData) => {
        try {
          const msg = JSON.parse(rawData.toString()) as ClientMessage;

          // Track activity
          containerLifecycleService.touchActivity(containerId);

          switch (msg.type) {
            case 'input':
              if (typeof msg.data === 'string') {
                // Fire-and-forget: terminal input is real-time and the bridge
                // agent doesn't respond to terminal.input (output comes via events).
                // Using send() would block on a 30s timeout through a concurrency-1 queue.
                bridgeClient.terminalWrite(sessionId, msg.data);
              }
              break;

            case 'resize':
              if (typeof msg.cols === 'number' && typeof msg.rows === 'number') {
                await bridgeClient.terminalResize(sessionId, msg.cols, msg.rows);
              }
              break;

            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              break;

            default:
              sendError(ws, `Unknown message type: ${(msg as { type: string }).type}`);
          }
        } catch (err) {
          log.error({ err, containerId, sessionId }, 'Error handling terminal message');
          sendError(ws, 'Failed to process message');
        }
      });

      // Handle disconnect
      ws.on('close', (code, reason) => {
        log.info({ containerId, sessionId, code, reason: reason.toString() }, 'Terminal WebSocket disconnected');
        clearInterval(heartbeat);
        bridgeClient.removeListener('terminal.output', onTerminalOutput);
        bridgeClient.removeListener('terminal.exit', onTerminalExit);
      });

      ws.on('error', (err) => {
        log.error({ err, containerId, sessionId }, 'Terminal WebSocket error');
        clearInterval(heartbeat);
        bridgeClient.removeListener('terminal.output', onTerminalOutput);
        bridgeClient.removeListener('terminal.exit', onTerminalExit);
      });
    },
  );

  log.info('Workspace terminal WebSocket handler initialized');
  return wss;
}

/** Send an error message to the client */
function sendError(ws: WebSocket, message: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'error', message }));
  }
}
