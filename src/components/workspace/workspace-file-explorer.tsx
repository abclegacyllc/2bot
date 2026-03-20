"use client";

/**
 * Workspace File Explorer
 *
 * Tree-style file browser for workspace containers. Shows files
 * and directories, supports CRUD operations, and integrates
 * with the code editor for file editing.
 *
 * @module components/workspace/workspace-file-explorer
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WorkspaceFileEntry } from "@/shared/types/workspace";
import {
    ChevronDown,
    ChevronRight,
    File,
    FileCode2,
    FilePlus,
    Folder,
    FolderOpen,
    FolderPlus,
    PackagePlus,
    Play,
    RefreshCw,
    Trash2,
    Upload,
} from "lucide-react";
import { useCallback, useState, type DragEvent, type MouseEvent } from "react";

// ===========================================
// Props
// ===========================================

interface WorkspaceFileExplorerProps {
  files: WorkspaceFileEntry[];
  onFileSelect: (file: WorkspaceFileEntry) => void;
  onRefresh: (path?: string) => Promise<void>;
  onCreateFile: (path: string) => Promise<void>;
  onCreateDir: (path: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  onStartPlugin: (file: string) => Promise<void>;
  onRegisterAsPlugin?: (dirPath: string) => Promise<void>;
  onUploadFile?: (path: string, content: string) => Promise<void>;
  selectedPath?: string;
  loading?: boolean;
}

// ===========================================
// File Icon
// ===========================================

function getFileIcon(entry: WorkspaceFileEntry) {
  if (entry.type === "DIRECTORY") return null; // handled in tree node
  const ext = entry.name.split(".").pop()?.toLowerCase();
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext || "")) {
    return <FileCode2 className="h-4 w-4 text-blue-400 flex-shrink-0" />;
  }
  if (["json", "yaml", "yml", "toml"].includes(ext || "")) {
    return <FileCode2 className="h-4 w-4 text-yellow-400 flex-shrink-0" />;
  }
  return <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
}

// ===========================================
// Tree Node
// ===========================================

function TreeNode({
  entry,
  depth,
  selectedPath,
  onSelect,
  onDelete,
  onStartPlugin,
  onRegisterAsPlugin,
}: {
  entry: WorkspaceFileEntry;
  depth: number;
  selectedPath?: string;
  onSelect: (entry: WorkspaceFileEntry) => void;
  onDelete: (path: string) => void;
  onStartPlugin: (file: string) => void;
  onRegisterAsPlugin?: (dirPath: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = entry.type === "DIRECTORY";
  const isSelected = entry.path === selectedPath;
  const isPlugin = entry.isPlugin;

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onSelect(entry);
    }
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    onDelete(entry.path);
  };

  const handleStartPlugin = (e: MouseEvent) => {
    e.stopPropagation();
    onStartPlugin(entry.path);
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded text-sm group transition-colors ${
          isSelected
            ? "bg-purple-600/20 text-purple-300"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/collapse for directories */}
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          )
        ) : (
          <span className="w-3.5" />
        )}

        {/* Icon */}
        {isDir ? (
          expanded ? (
            <FolderOpen className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          )
        ) : (
          getFileIcon(entry)
        )}

        {/* Name */}
        <span className="truncate flex-1">
          {entry.displayName ?? entry.name}
          {entry.displayName && entry.type === 'FILE' ? (
            <span className="text-muted-foreground/50 text-[10px] ml-1">({entry.name})</span>
          ) : null}
        </span>

        {/* Plugin badge */}
        {isPlugin ? (
          <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500 text-green-400">
            plugin
          </Badge>
        ) : null}

        {/* Actions (visible on hover) */}
        <div className="hidden group-hover:flex items-center gap-0.5">
          {Boolean(isPlugin) && (
            <button
              onClick={handleStartPlugin}
              className="p-0.5 rounded hover:bg-green-600/20"
              title="Run plugin"
            >
              <Play className="h-3 w-3 text-green-400" />
            </button>
          )}
          {Boolean(isDir && !isPlugin && onRegisterAsPlugin) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRegisterAsPlugin?.(entry.path);
              }}
              className="p-0.5 rounded hover:bg-purple-600/20"
              title="Register as Plugin"
            >
              <PackagePlus className="h-3 w-3 text-purple-400" />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="p-0.5 rounded hover:bg-red-600/20"
            title="Delete"
          >
            <Trash2 className="h-3 w-3 text-red-400" />
          </button>
        </div>
      </div>

      {/* Children (expanded) */}
      {Boolean(isDir && expanded) && entry.children?.map((child) => (
        <TreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onDelete={onDelete}
          onStartPlugin={onStartPlugin}
          onRegisterAsPlugin={onRegisterAsPlugin}
        />
      ))}
    </div>
  );
}

// ===========================================
// Main Component
// ===========================================

export function WorkspaceFileExplorer({
  files,
  onFileSelect,
  onRefresh,
  onCreateFile,
  onCreateDir,
  onDelete,
  onStartPlugin,
  onRegisterAsPlugin,
  onUploadFile,
  selectedPath,
  loading,
}: WorkspaceFileExplorerProps) {
  const [newFileName, setNewFileName] = useState("");
  const [showNewInput, setShowNewInput] = useState<"file" | "dir" | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!newFileName.trim()) return;
    // Fix: Path should be relative to workspace root, not include /workspace prefix
    const path = `/${newFileName.trim()}`;
    if (showNewInput === "dir") {
      await onCreateDir(path);
    } else {
      await onCreateFile(path);
    }
    setNewFileName("");
    setShowNewInput(null);
    await onRefresh("/");
  }, [newFileName, showNewInput, onCreateFile, onCreateDir, onRefresh]);

  const handleDeleteAndRefresh = useCallback(async (path: string) => {
    await onDelete(path);
    await onRefresh("/");
  }, [onDelete, onRefresh]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!onUploadFile || !e.dataTransfer.files.length) return;

    const fileList = Array.from(e.dataTransfer.files);
    for (const file of fileList) {
      const reader = new FileReader();
      reader.onload = async () => {
        const content = reader.result as string;
        // For text files send raw content, for binary send base64
        const isText = file.type.startsWith("text/") || /\.(ts|tsx|js|jsx|json|md|txt|yaml|yml|html|css|sh|toml|env|csv)$/i.test(file.name);
        if (isText) {
          await onUploadFile(`/${file.name}`, content);
        } else {
          // base64 encode binary
          const b64Reader = new FileReader();
          b64Reader.onload = async () => {
            const base64 = (b64Reader.result as string).split(",")[1] ?? "";
            await onUploadFile(`/${file.name}`, base64);
          };
          b64Reader.readAsDataURL(file);
        }
      };
      reader.readAsText(file);
    }
    await onRefresh("/");
  }, [onUploadFile, onRefresh]);

  return (
    <div
      className={`flex flex-col h-full ${dragOver ? "ring-2 ring-inset ring-purple-500 bg-purple-500/5" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Files
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowNewInput("file")}
            title="New file"
          >
            <FilePlus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowNewInput("dir")}
            title="New folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
          {onUploadFile ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.onchange = async () => {
                if (!input.files) return;
                for (const file of Array.from(input.files)) {
                  const text = await file.text();
                  await onUploadFile(`/${file.name}`, text);
                }
                await onRefresh("/");
              };
              input.click();
            }}
            title="Upload files"
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onRefresh("/")}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* New file/dir input */}
      {showNewInput ? (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-1">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={showNewInput === "dir" ? "folder-name" : "filename.ts"}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setShowNewInput(null);
              }}
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs px-2" onClick={handleCreate}>
              OK
            </Button>
          </div>
        </div>
      ) : null}

      {/* File tree */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {files.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">
              No files yet. Create a file, clone a repo, or drag &amp; drop files here.
            </p>
          )}
          {files.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              selectedPath={selectedPath}
              onSelect={onFileSelect}
              onDelete={handleDeleteAndRefresh}
              onStartPlugin={onStartPlugin}
              onRegisterAsPlugin={onRegisterAsPlugin}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
