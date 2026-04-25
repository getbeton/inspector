"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Check, AlertCircle, Eye, EyeOff, Database, Link2 } from "lucide-react";
import { parseConnectionString } from "@/lib/integrations/postgres/connection-string";
import { isPrivateHostname } from "@/lib/utils/ssrf";
import {
  createDataSource,
  validateDataSource,
} from "@/lib/api/data-sources";

type InputMode = "fields" | "connection_string";
type StepState = "idle" | "validating" | "success" | "error";

const SSL_MODES = [
  { id: "require", label: "Require (recommended)" },
  { id: "prefer", label: "Prefer" },
  { id: "disable", label: "Disable" },
] as const;

export interface PostgresStepProps {
  onSuccess: (data: { dataSourceId: string; name: string }) => void;
  className?: string;
}

export function PostgresStep({ onSuccess, className }: PostgresStepProps) {
  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>("connection_string");

  // Form fields
  const [name, setName] = useState("");
  const [connectionString, setConnectionString] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sslMode, setSslMode] = useState("require");

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<StepState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Parse connection string into fields on blur
  const handleConnectionStringBlur = useCallback(() => {
    if (!connectionString.trim()) return;
    try {
      const parsed = parseConnectionString(connectionString);
      if (parsed.host) setHost(parsed.host);
      if (parsed.port) setPort(String(parsed.port));
      if (parsed.database) setDatabase(parsed.database);
      if (parsed.user) setUsername(parsed.user);
      if (parsed.password) setPassword(parsed.password);
      if (parsed.sslMode) setSslMode(parsed.sslMode);
    } catch {
      // Invalid string — user will see error on submit
    }
  }, [connectionString]);

  const handleConnect = useCallback(async () => {
    // Validate required fields
    if (!name.trim()) {
      setErrorMessage("Please give this data source a name (e.g., \"Production DB\")");
      setState("error");
      return;
    }
    if (!host.trim()) {
      setErrorMessage("Host is required");
      setState("error");
      return;
    }
    if (!database.trim()) {
      setErrorMessage("Database name is required");
      setState("error");
      return;
    }
    if (!username.trim()) {
      setErrorMessage("Username is required");
      setState("error");
      return;
    }
    if (!password) {
      setErrorMessage("Password is required");
      setState("error");
      return;
    }

    // Client-side SSRF check
    if (isPrivateHostname(host.trim())) {
      setErrorMessage("Cannot connect to private/internal addresses. Use a publicly accessible host.");
      setState("error");
      return;
    }

    setState("validating");
    setErrorMessage("");

    try {
      // Step 1: Create the data source
      const createResult = await createDataSource({
        name: name.trim(),
        host: host.trim(),
        port: parseInt(port) || 5432,
        database_name: database.trim(),
        username: username.trim(),
        password,
        ssl_mode: sslMode,
      });

      const dsId = (createResult.data_source as { id: string }).id;

      // Step 2: Test the connection
      const validateResult = await validateDataSource(dsId);

      if (validateResult.status === "connected") {
        setState("success");
        onSuccess({ dataSourceId: dsId, name: name.trim() });
      } else {
        setState("error");
        setErrorMessage(validateResult.message || "Connection failed");
      }
    } catch (err) {
      setState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    }
  }, [name, host, port, database, username, password, sslMode, onSuccess]);

  const isReady =
    name.trim() &&
    host.trim() &&
    database.trim() &&
    username.trim() &&
    password;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded bg-[#336791] flex items-center justify-center p-0.5">
          <Database className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-medium">Connect PostgreSQL</span>
      </div>

      <p className="text-sm text-muted-foreground">
        Connect your PostgreSQL database to explore data and run analytics queries.
      </p>

      {/* Data source name */}
      <div className="space-y-1.5">
        <Label htmlFor="pg-name" className="text-sm font-medium">
          Data Source Name
        </Label>
        <Input
          id="pg-name"
          placeholder='e.g., "Production DB" or "Analytics Replica"'
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={state === "validating" || state === "success"}
        />
      </div>

      {/* Input mode toggle */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setInputMode("connection_string")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            inputMode === "connection_string"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Link2 className="h-3 w-3" />
          Connection String
        </button>
        <button
          type="button"
          onClick={() => setInputMode("fields")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
            inputMode === "fields"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Database className="h-3 w-3" />
          Individual Fields
        </button>
      </div>

      {/* Connection string input */}
      {inputMode === "connection_string" && (
        <div className="space-y-1.5">
          <Label htmlFor="pg-connstr" className="text-sm font-medium">
            Connection String
          </Label>
          <Input
            id="pg-connstr"
            placeholder="postgresql://user:password@host:5432/database"
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            onBlur={handleConnectionStringBlur}
            disabled={state === "validating" || state === "success"}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Paste your connection string — fields below will be populated automatically.
          </p>
        </div>
      )}

      {/* Individual fields (always shown, populated from conn string) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1 space-y-1.5">
          <Label htmlFor="pg-host" className="text-sm font-medium">Host</Label>
          <Input
            id="pg-host"
            placeholder="db.example.com"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            disabled={state === "validating" || state === "success"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pg-port" className="text-sm font-medium">Port</Label>
          <Input
            id="pg-port"
            placeholder="5432"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            disabled={state === "validating" || state === "success"}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor="pg-database" className="text-sm font-medium">Database</Label>
          <Input
            id="pg-database"
            placeholder="mydb"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            disabled={state === "validating" || state === "success"}
          />
        </div>
        <div className="col-span-2 sm:col-span-1 space-y-1.5">
          <Label htmlFor="pg-user" className="text-sm font-medium">Username</Label>
          <Input
            id="pg-user"
            placeholder="postgres"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={state === "validating" || state === "success"}
          />
        </div>
        <div className="col-span-2 sm:col-span-1 space-y-1.5">
          <Label htmlFor="pg-pass" className="text-sm font-medium">Password</Label>
          <div className="relative">
            <Input
              id="pg-pass"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={state === "validating" || state === "success"}
              className="pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* SSL mode */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">SSL Mode</Label>
        <div className="flex gap-2">
          {SSL_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setSslMode(mode.id)}
              disabled={state === "validating" || state === "success"}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border-2 transition-colors",
                sslMode === mode.id
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-foreground/10 text-muted-foreground hover:border-foreground/20"
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {state === "error" && errorMessage && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Failed</AlertTitle>
          <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* Success */}
      {state === "success" && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Connected to {database}
            </p>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
            {host}:{port} &middot; User: {username}
          </p>
        </div>
      )}

      {/* Connect button */}
      {state !== "success" && (
        <Button
          onClick={handleConnect}
          disabled={!isReady || state === "validating"}
          className="w-full"
        >
          {state === "validating" ? (
            <span className="flex items-center gap-2">
              <Spinner className="h-4 w-4" />
              Testing connection...
            </span>
          ) : (
            "Connect PostgreSQL"
          )}
        </Button>
      )}

      {/* Recommendation */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        For security, we recommend creating a <strong>read-only database role</strong> for
        Beton. All queries are enforced as read-only, but a dedicated role adds
        an extra layer of protection.
      </p>
    </div>
  );
}
