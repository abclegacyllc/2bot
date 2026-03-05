/**
 * Bridge Client Service
 * 
 * WebSocket client that connects to the bridge agent running inside
 * a workspace container. Provides a request/response API for sending
 * commands and receiving events from the container.
 * 
 * Each running container gets its own BridgeClient instance.
 * The workspace service manages the lifecycle of these clients.
 * 
 * Pattern: "Phone in a Prison" — platform sends commands through WebSocket,
 * bridge agent executes them inside the container sandbox.
 * 
 * @module modules/workspace/bridge-client.service
 */

import crypto from 'crypto';
import { EventEmitter } from 'events';
import PQueue from 'p-queue';
import WebSocket from 'ws';

import { logger } from '@/lib/logger';

import type { PluginIpcRequest, PluginIpcResponse } from '@/modules/plugin/plugin-ipc.service';
import { bridgeLeaseService, SERVER_INSTANCE_ID } from './bridge-lease.service';

import type { BridgeAction, BridgeEvent, BridgeRequest, BridgeResponse } from '@/shared/types/workspace';
import {
    BRIDGE_LONG_REQUEST_TIMEOUT,
    BRIDGE_REQUEST_TIMEOUT,
    BRIDGE_WS_PATH,
    LONG_RUNNING_ACTIONS,
    WS_MAX_RECONNECT_ATTEMPTS,
    WS_RECONNECT_BASE_DELAY,
} from './workspace.constants';
import type { PendingBridgeRequest } from './workspace.types';

const log = logger.child({ module: 'workspace:bridge' });

// ===========================================
// Bridge Client
// ===========================================

export class BridgeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, PendingBridgeRequest> = new Map();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private authenticated = false;
  private destroyed = false;

  // Ping/pong heartbeat — detect dead connections early
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPong = 0;
  private static readonly PING_INTERVAL_MS = 30_000;
  private static readonly PONG_TIMEOUT_MS = 60_000;

  // Request queue — serializes WebSocket operations to prevent interleaving
  private readonly requestQueue = new PQueue({ concurrency: 1 });

  /** Handler for IPC requests from plugins running inside this container */
  private ipcHandler:
    | ((containerDbId: string, request: PluginIpcRequest) => Promise<PluginIpcResponse>)
    | null = null;

  constructor(
    /** Database ID of the workspace container */
    public readonly containerDbId: string,
    /** WebSocket URL to the bridge agent (ws://127.0.0.1:{port}/ws) */
    private readonly wsUrl: string,
    /** Auth token for bridge agent authentication */
    private readonly authToken: string,
    /** Bridge port used for this connection */
    public readonly bridgePort: number = 0,
  ) {
    super();
  }

  /**
   * Check if this client has been destroyed (won't reconnect).
   */
  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Register an IPC handler for plugin requests.
   * Called once in platform startup to wire the plugin IPC service.
   */
  setIpcHandler(
    handler: (containerDbId: string, request: PluginIpcRequest) => Promise<PluginIpcResponse>,
  ): void {
    this.ipcHandler = handler;
  }

  // ===========================================
  // Connection Management
  // ===========================================

  /**
   * Connect to the bridge agent WebSocket
   * Returns a promise that resolves when authenticated
   */
  async connect(): Promise<void> {
    if (this.destroyed) {
      throw new Error('BridgeClient has been destroyed');
    }

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Bridge connection timeout for container ${this.containerDbId}`));
      }, 15_000);

      try {
        this.ws = new WebSocket(this.wsUrl, {
          handshakeTimeout: 10_000,
          maxPayload: 10 * 1024 * 1024, // 10MB — protect against OOM from rogue messages
        });

        this.ws.on('open', () => {
          log.info({ containerDbId: this.containerDbId }, 'Bridge WebSocket connected, authenticating...');
          // First message must be the JSON auth message matching bridge agent protocol
          this.ws?.send(JSON.stringify({
            id: 'auth-init',
            action: 'auth',
            payload: { token: this.authToken },
          }));
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          const message = data.toString();

          // First response after sending auth token
          if (!this.authenticated) {
            try {
              const parsed = JSON.parse(message);
              // Bridge agent responds with { id, success: true, data: { authenticated: true } }
              if (parsed.success && parsed.data?.authenticated) {
                this.authenticated = true;
                this.reconnectAttempts = 0;
                clearTimeout(timeoutId);
                this.startHeartbeat();
                log.info({ containerDbId: this.containerDbId }, 'Bridge authenticated');
                this.emit('connected');
                resolve();
                return;
              } else {
                clearTimeout(timeoutId);
                reject(new Error(`Bridge auth failed: ${parsed.error || message}`));
                return;
              }
            } catch {
              clearTimeout(timeoutId);
              reject(new Error(`Bridge auth failed: unexpected response`));
              return;
            }
          }

          // Handle normal messages
          this.handleMessage(message);
        });

        this.ws.on('close', (code, reason) => {
          this.authenticated = false;
          this.stopHeartbeat();
          log.info({ containerDbId: this.containerDbId, code, reason: reason.toString() }, 'Bridge WebSocket closed');
          this.emit('disconnected', { code, reason: reason.toString() });

          // Auto-reconnect if not destroyed.
          // Do NOT reconnect if close code 4002 (Replaced by new connection) — a newer
          // client already took over. Reconnecting would create a cascade of replacements.
          // Also mark as destroyed so getClient() doesn't hang waiting for reconnect.
          if (code === 4002) {
            this.destroyed = true;
          } else if (!this.destroyed) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (err) => {
          log.error({ containerDbId: this.containerDbId, error: err.message }, 'Bridge WebSocket error');

          if (!this.authenticated) {
            clearTimeout(timeoutId);
            reject(err);
          }

          // Only emit if there are listeners to avoid uncaught exception crash
          if (this.listenerCount('error') > 0) {
            this.emit('error', err);
          }
        });
      } catch (err) {
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  /**
   * Disconnect from the bridge agent
   */
  disconnect(): void {
    this.destroyed = true;
    this.stopHeartbeat();
    this.requestQueue.clear();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Bridge client disconnected'));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.authenticated = false;
  }

  /**
   * Check if connected and authenticated
   */
  get isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  // ===========================================
  // Request/Response API
  // ===========================================

  /**
   * Send an action to the bridge agent and wait for response.
   * Requests are queued (concurrency: 1) to prevent WebSocket interleaving.
   */
  async send<T = unknown>(action: BridgeAction, payload: Record<string, unknown> = {}): Promise<T> {
    return this.requestQueue.add(() => this._sendImmediate<T>(action, payload)) as Promise<T>;
  }

  /**
   * Internal: send without queuing (used by the queue worker)
   */
  private async _sendImmediate<T = unknown>(action: BridgeAction, payload: Record<string, unknown> = {}): Promise<T> {
    if (!this.isConnected) {
      throw new Error(`Bridge not connected for container ${this.containerDbId}`);
    }

    const id = crypto.randomUUID();
    const timeout = LONG_RUNNING_ACTIONS.has(action)
      ? BRIDGE_LONG_REQUEST_TIMEOUT
      : BRIDGE_REQUEST_TIMEOUT;

    const request: BridgeRequest = { id, action, payload };

    return new Promise<T>((resolve, reject) => {
      // Set timeout for response
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Bridge request timeout: ${action} (${timeout}ms)`));
      }, timeout);

      // Track pending request
      this.pendingRequests.set(id, {
        id,
        action,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutHandle,
        createdAt: Date.now(),
      });

      // Send request
      if (this.ws) {
        this.ws.send(JSON.stringify(request));
      }

      log.debug({ containerDbId: this.containerDbId, action, id }, 'Bridge request sent');
    });
  }

  /**
   * Send raw data to bridge (for terminal input streaming)
   */
  sendRaw(data: string): void {
    if (!this.isConnected || !this.ws) {
      throw new Error(`Bridge not connected for container ${this.containerDbId}`);
    }
    this.ws.send(data);
  }

  /**
   * Send an action to the bridge agent WITHOUT waiting for a response.
   * Used for real-time streaming (terminal input) where latency matters
   * and the bridge agent intentionally does not respond.
   * Bypasses the request queue to avoid concurrency-1 bottleneck.
   */
  sendFireAndForget(action: BridgeAction, payload: Record<string, unknown> = {}): void {
    if (!this.isConnected || !this.ws) {
      throw new Error(`Bridge not connected for container ${this.containerDbId}`);
    }
    const id = crypto.randomUUID();
    const request: BridgeRequest = { id, action, payload };
    this.ws.send(JSON.stringify(request));
    log.debug({ containerDbId: this.containerDbId, action, id }, 'Bridge fire-and-forget sent');
  }

  // ===========================================
  // Convenience Methods
  // ===========================================

  // --- File Operations ---
  async fileList(path = '/', recursive = false) {
    return this.send('file.list', { path, recursive });
  }

  async fileRead(path: string) {
    return this.send('file.read', { path });
  }

  async fileWrite(path: string, content: string, createDirs = true) {
    return this.send('file.write', { path, content, createDirs });
  }

  /** Write multiple files at once (for directory plugin scaffolding). */
  async fileWriteMulti(files: Array<{ path: string; content: string }>) {
    return this.send<Array<{ path: string; sizeBytes: number }>>('file.writeMulti', { files });
  }

  async fileDelete(path: string) {
    return this.send('file.delete', { path });
  }

  async fileMkdir(path: string) {
    return this.send('file.mkdir', { path });
  }

  async fileRename(oldPath: string, newPath: string) {
    return this.send('file.rename', { oldPath, newPath });
  }

  // --- Plugin Operations ---
  async pluginStart(file: string, env?: Record<string, string>, storageQuotaMb?: number) {
    return this.send('plugin.start', { file, env, storageQuotaMb });
  }

  async pluginStop(file: string, force = false) {
    return this.send('plugin.stop', { file, force });
  }

  async pluginRestart(file: string) {
    return this.send('plugin.restart', { file });
  }

  async pluginList() {
    return this.send('plugin.list', {});
  }

  async pluginLogs(file: string) {
    return this.send('plugin.logs', { file });
  }

  async pluginValidate(file: string) {
    return this.send('plugin.validate', { file }) as Promise<{
      valid: boolean;
      problems: Array<{ severity: 'error' | 'warning' | 'info'; message: string; line?: number; column?: number }>;
    }>;
  }

  /** Push an event to a running plugin (event-driven model). */
  async pluginEvent(file: string, event: unknown): Promise<{ success: boolean; error?: string }> {
    return this.send('plugin.event', { file, event }) as Promise<{ success: boolean; error?: string }>;
  }

  // --- Git Operations ---
  async gitClone(url: string, options: { targetDir?: string; branch?: string; depth?: number; credentials?: { username: string; token: string } } = {}) {
    return this.send('git.clone', { url, ...options });
  }

  async gitPull(directory?: string, credentials?: { username: string; token: string }) {
    return this.send('git.pull', { directory, credentials });
  }

  async gitStatus(directory?: string) {
    return this.send('git.status', { directory });
  }

  // --- Package Operations ---
  async packageInstall(packages: string[], options: { dev?: boolean; cwd?: string } = {}) {
    return this.send('package.install', { packages, ...options });
  }

  async packageUninstall(packages: string[], cwd?: string) {
    return this.send('package.uninstall', { packages, cwd });
  }

  async packageList(cwd?: string) {
    return this.send('package.list', { cwd });
  }

  // --- Terminal Operations ---
  async terminalCreate(cols = 80, rows = 24) {
    return this.send('terminal.create', { cols, rows });
  }

  /**
   * Write data to a terminal session (fire-and-forget).
   * Terminal input is real-time and doesn't need a response.
   * The bridge agent writes to PTY and output comes back via events.
   */
  terminalWrite(sessionId: string, data: string): void {
    this.sendFireAndForget('terminal.input', { sessionId, data });
  }

  async terminalResize(sessionId: string, cols: number, rows: number) {
    return this.send('terminal.resize', { sessionId, cols, rows });
  }

  async terminalClose(sessionId: string) {
    return this.send('terminal.close', { sessionId });
  }

  // --- System Operations ---
  async systemStats() {
    return this.send('system.stats', {});
  }

  async storageStats() {
    return this.send('storage.stats', {});
  }

  async systemHealth() {
    return this.send('system.health', {});
  }

  // ===========================================
  // Internal
  // ===========================================

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(raw: string): void {
    try {
      const message = JSON.parse(raw);

      // Bridge response (matches a pending request)
      if (message.id && this.pendingRequests.has(message.id)) {
        const pending = this.pendingRequests.get(message.id);
        if (!pending) return;
        this.pendingRequests.delete(message.id);
        clearTimeout(pending.timeout);

        const response = message as BridgeResponse;
        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(new Error(response.error || `Bridge action failed: ${pending.action}`));
        }

        log.debug({
          containerDbId: this.containerDbId,
          action: pending.action,
          success: response.success,
          latency: Date.now() - pending.createdAt,
        }, 'Bridge response received');
        return;
      }

      // IPC request from a plugin inside the container (reverse request-response)
      if (message.ipcRequest && message.id) {
        this.handleIpcRequest(message as PluginIpcRequest);
        return;
      }

      // Bridge event (unsolicited push from agent)
      if (message.event) {
        const event = message as BridgeEvent;
        this.emit('bridge-event', event);
        this.emit(event.event, event.data);

        log.debug({ containerDbId: this.containerDbId, event: event.event }, 'Bridge event received');
        return;
      }

      log.warn({ containerDbId: this.containerDbId, message: raw.substring(0, 200) }, 'Unknown bridge message');
    } catch (err) {
      log.error({ containerDbId: this.containerDbId, error: (err as Error).message }, 'Failed to parse bridge message');
    }
  }

  /**
   * Handle an IPC request from a plugin inside this container.
   * Delegates to the registered IPC handler and sends the response back.
   */
  private async handleIpcRequest(request: PluginIpcRequest): Promise<void> {
    if (!this.ipcHandler) {
      this.sendIpcResponse({ id: request.id, success: false, error: 'No IPC handler registered on platform' });
      return;
    }

    try {
      const response = await this.ipcHandler(this.containerDbId, request);
      this.sendIpcResponse(response);
    } catch (err) {
      this.sendIpcResponse({
        id: request.id,
        success: false,
        error: err instanceof Error ? err.message : 'IPC handler error',
      });
    }
  }

  /**
   * Send an IPC response back to the bridge agent.
   */
  private sendIpcResponse(response: PluginIpcResponse): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        id: response.id,
        ipcResponse: true,
        success: response.success,
        result: response.result,
        error: response.error,
      }));
    }
  }

  /**
   * Start ping/pong heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.lastPong = Date.now();

    // Listen for pong replies
    this.ws?.on('pong', () => {
      this.lastPong = Date.now();
    });

    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // Check if pong is overdue
      if (Date.now() - this.lastPong > BridgeClient.PONG_TIMEOUT_MS) {
        log.warn({ containerDbId: this.containerDbId }, 'Bridge pong timeout — terminating connection');
        this.ws.terminate();
        return;
      }

      this.ws.ping();
    }, BridgeClient.PING_INTERVAL_MS);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Schedule a reconnect attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
      if (this.reconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
        log.error({ containerDbId: this.containerDbId, attempts: this.reconnectAttempts }, 'Max bridge reconnect attempts reached');
        this.emit('max-reconnects');
      }
      return;
    }

    const delay = WS_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    log.info({ containerDbId: this.containerDbId, delay, attempt: this.reconnectAttempts }, 'Scheduling bridge reconnect');

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        log.error({ containerDbId: this.containerDbId, error: (err as Error).message }, 'Bridge reconnect failed');
        // scheduleReconnect will be called by the 'close' handler
      }
    }, delay);
  }
}

// ===========================================
// Bridge Client Manager (per-container clients)
// ===========================================

/**
 * Manages bridge client instances for all running containers.
 * One BridgeClient per container.
 */
class BridgeClientManager {
  private clients: Map<string, BridgeClient> = new Map();

  /** Pending connection promises to prevent concurrent connection attempts */
  private pendingConnections: Map<string, Promise<BridgeClient>> = new Map();

  /** Global IPC handler, set once at startup */
  private ipcHandler:
    | ((containerDbId: string, request: PluginIpcRequest) => Promise<PluginIpcResponse>)
    | null = null;

  /**
   * Register a global IPC handler for all bridge clients.
   * Called once at platform startup.
   */
  setIpcHandler(
    handler: (containerDbId: string, request: PluginIpcRequest) => Promise<PluginIpcResponse>,
  ): void {
    this.ipcHandler = handler;

    // Also set on any existing clients
    for (const client of this.clients.values()) {
      client.setIpcHandler(handler);
    }
  }

  /**
   * Get or create a bridge client for a container.
   * Uses a pending connections map to prevent concurrent connection attempts
   * to the same container (which would cause multiple WebSocket connections
   * and "Replacing existing platform connection" issues).
   *
   * With bridge leases: only the server instance that holds the lease for this
   * container is allowed to connect. This prevents dev + prod servers from
   * fighting over the same bridge (connection storm).
   */
  async getClient(containerDbId: string, bridgePort: number, authToken: string): Promise<BridgeClient> {
    // Return existing client if connected
    const existing = this.clients.get(containerDbId);
    if (existing?.isConnected) {
      return existing;
    }

    // Acquire a bridge lease before connecting.
    // If another server instance (e.g., dev server) already owns this bridge,
    // we must not connect — that would cause a connection storm.
    const leaseAcquired = await bridgeLeaseService.acquire(containerDbId);
    if (!leaseAcquired) {
      const holder = await bridgeLeaseService.getHolder(containerDbId);
      throw new Error(
        `Bridge connection blocked by lease: container ${containerDbId} is owned by ${holder}. ` +
        `This instance (${SERVER_INSTANCE_ID}) cannot connect. ` +
        `Stop the other server or wait for its lease to expire.`
      );
    }

    // If there's already a connection in progress, wait for it
    const pending = this.pendingConnections.get(containerDbId);
    if (pending) {
      return pending;
    }

    // If existing client is still alive (reconnecting) and port hasn't changed,
    // don't create a new one — let it handle its own reconnection.
    // Creating a duplicate would cause "Replacing existing platform connection" churn.
    if (existing && !existing.isDestroyed && existing.bridgePort === bridgePort) {
      log.debug({ containerDbId }, 'Bridge client reconnecting on same port — skipping new connection');
      return new Promise<BridgeClient>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timed out waiting for bridge client to reconnect'));
        }, 20_000);
        existing.once('connected', () => {
          clearTimeout(timeout);
          resolve(existing);
        });
        existing.once('max-reconnects', () => {
          clearTimeout(timeout);
          // Client failed to reconnect — create a fresh one
          this.clients.delete(containerDbId);
          this._createClient(containerDbId, bridgePort, authToken).then(resolve, reject);
        });
      });
    }

    // Create the connection promise and store it
    const connectionPromise = this._createClient(containerDbId, bridgePort, authToken);
    this.pendingConnections.set(containerDbId, connectionPromise);

    try {
      const client = await connectionPromise;
      return client;
    } finally {
      this.pendingConnections.delete(containerDbId);
    }
  }

  /**
   * Internal: Create and connect a new bridge client
   */
  private async _createClient(containerDbId: string, bridgePort: number, authToken: string): Promise<BridgeClient> {
    // Clean up old client if any
    const existing = this.clients.get(containerDbId);
    if (existing) {
      existing.disconnect();
      this.clients.delete(containerDbId);
    }

    // Create new client
    const wsUrl = `ws://127.0.0.1:${bridgePort}${BRIDGE_WS_PATH}`;
    const client = new BridgeClient(containerDbId, wsUrl, authToken, bridgePort);

    // Forward events
    client.on('max-reconnects', () => {
      log.error({ containerDbId }, 'Bridge client max reconnects — removing client');
      this.clients.delete(containerDbId);
    });

    // Clean up zombie clients: if connection is replaced (4002), remove from map
    // so health check / getClient can create a fresh one cleanly
    client.on('disconnected', ({ code }: { code: number }) => {
      if (code === 4002 && this.clients.get(containerDbId) === client) {
        log.debug({ containerDbId }, 'Bridge client replaced (4002) — removing from manager');
        this.clients.delete(containerDbId);
      }
    });

    // Wire IPC handler if registered
    if (this.ipcHandler) {
      client.setIpcHandler(this.ipcHandler);
    }

    // Listen for inbound traffic events and store them
    client.on('traffic.inbound', (data: Record<string, unknown>) => {
      // Lazy import to avoid circular deps
      import('./egress-proxy.service').then(({ egressProxyService }) => {
        egressProxyService.storeInboundLog(containerDbId, data as {
          timestamp: string;
          domain: string;
          url?: string;
          method: string;
          httpStatus: number;
          bytesTransferred: number;
          sourceType?: string;
          pluginFile?: string;
          gatewayId?: string;
          eventType?: string;
          pluginsDelivered?: number;
        }).catch(() => { /* logged internally */ });
      }).catch((err) => {
        log.warn({ containerDbId, error: (err as Error).message }, 'Failed to import egress-proxy for inbound log');
      });
    });

    // Connect
    await client.connect();
    this.clients.set(containerDbId, client);

    return client;
  }

  /**
   * Get existing client (without creating)
   */
  getExistingClient(containerDbId: string): BridgeClient | null {
    const client = this.clients.get(containerDbId);
    return client?.isConnected ? client : null;
  }

  /**
   * Check if a client exists for a container (connected or reconnecting).
   * Returns true if BridgeClient auto-reconnect is already handling reconnection.
   */
  hasClient(containerDbId: string): boolean {
    const client = this.clients.get(containerDbId);
    return !!client && !client.isDestroyed;
  }

  /**
   * Disconnect and remove a client, releasing its bridge lease.
   */
  removeClient(containerDbId: string): void {
    const client = this.clients.get(containerDbId);
    if (client) {
      client.disconnect();
      this.clients.delete(containerDbId);
    }
    // Release the lease so another server instance can pick it up
    bridgeLeaseService.release(containerDbId).catch(err => {
      log.warn({ containerDbId, error: (err as Error).message }, 'Failed to release bridge lease on removeClient');
    });
  }

  /**
   * Disconnect all clients and release all leases (for shutdown)
   */
  async disconnectAll(): Promise<void> {
    for (const [id, client] of this.clients) {
      client.disconnect();
      this.clients.delete(id);
    }
    // Release all leases so other server instances can take over immediately
    await bridgeLeaseService.releaseAll();
  }

  /**
   * Get count of active connections
   */
  get activeCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.isConnected) count++;
    }
    return count;
  }
}

// ===========================================
// Singleton Export
// ===========================================

export const bridgeClientManager = new BridgeClientManager();
