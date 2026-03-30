"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { toastManager } from "@/components/ui/toast";
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Database, Plus, Trash2, RefreshCw } from "lucide-react";
import { useDataSources, useDeleteDataSource, useValidateDataSource } from "@/lib/hooks/use-data-sources";

export function DataSourcesSection() {
  const { data, isLoading } = useDataSources();
  const deleteMutation = useDeleteDataSource();
  const validateMutation = useValidateDataSource();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const dataSources = data?.data_sources ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Database Connections
          </h3>
        </div>
        <div className="flex items-center justify-center py-4">
          <Spinner className="size-4" />
        </div>
      </div>
    );
  }

  if (dataSources.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Database Connections
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.href = "/setup"}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>

      <div className="space-y-2">
        {dataSources.map((ds: Record<string, unknown>) => (
          <div
            key={ds.id as string}
            className="flex items-center justify-between rounded-lg border-2 border-border p-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-[#336791]/10 flex items-center justify-center">
                <Database className="h-4 w-4 text-[#336791]" />
              </div>
              <div>
                <p className="text-sm font-medium">{ds.name as string}</p>
                <p className="text-xs text-muted-foreground">
                  {ds.host as string}:{ds.port as number} / {ds.database_name as string}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {ds.status === "connected" ? (
                <Badge className="bg-success/10 text-success border-success/20">
                  Connected
                </Badge>
              ) : ds.status === "error" ? (
                <Badge variant="destructive">Error</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Pending
                </Badge>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={async () => {
                  try {
                    await validateMutation.mutateAsync(ds.id as string);
                    toastManager.add({ type: 'success', title: "Connection verified" });
                  } catch (e) {
                    toastManager.add({ type: 'error', title:
                      e instanceof Error ? e.message : "Validation failed"
                    });
                  }
                }}
                disabled={validateMutation.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${validateMutation.isPending ? "animate-spin" : ""}`} />
              </Button>

              <Dialog
                open={deletingId === (ds.id as string)}
                onOpenChange={(open) => setDeletingId(open ? (ds.id as string) : null)}
              >
                <DialogTrigger
                  render={
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
                <DialogPopup>
                  <DialogHeader>
                    <DialogTitle>Remove Data Source</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to remove &ldquo;{ds.name as string}&rdquo;? This
                      action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline">Cancel</Button>} />
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        try {
                          await deleteMutation.mutateAsync(ds.id as string);
                          setDeletingId(null);
                          toastManager.add({ type: 'success', title: "Data source removed" });
                        } catch (e) {
                          toastManager.add({ type: 'error', title:
                            e instanceof Error ? e.message : "Failed to remove"
                          });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Spinner className="size-4" />
                      ) : (
                        "Remove"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogPopup>
              </Dialog>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
