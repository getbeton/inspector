"use client";

import { Database, Check, Loader2 } from "lucide-react";

interface PostgresPreviewProps {
  isConnected: boolean;
  databaseName?: string;
  host?: string;
}

export function PostgresPreview({
  isConnected,
  databaseName,
  host,
}: PostgresPreviewProps) {
  return (
    <div className="rounded-lg border-2 border-foreground/10 bg-background p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg bg-[#336791]/10 flex items-center justify-center">
          <Database className="h-5 w-5 text-[#336791]" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">PostgreSQL</h4>
          <p className="text-xs text-muted-foreground">
            {isConnected ? "Connected" : "Connect your database"}
          </p>
        </div>
        {isConnected && (
          <div className="ml-auto h-6 w-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          </div>
        )}
      </div>

      {isConnected ? (
        <div className="space-y-2">
          {databaseName && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Database</span>
              <span className="font-mono">{databaseName}</span>
            </div>
          )}
          {host && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Host</span>
              <span className="font-mono truncate max-w-[200px]">{host}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Access</span>
            <span className="text-green-600 dark:text-green-400 font-medium">
              Read-only
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            Explore schema and tables
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            Run read-only analytics queries
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            AI-powered data exploration
          </div>
        </div>
      )}
    </div>
  );
}
