export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerSink {
  debug?: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface LoggerOptions {
  enabled?: boolean;
  sink?: LoggerSink;
}

function isDevEnvironment(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return true;
  }
}

export class Logger {
  private static _globalEnabled = isDevEnvironment();
  private readonly _scope: string;
  private readonly _enabled: boolean;
  private readonly _sink: LoggerSink;

  public constructor(scope: string, options: LoggerOptions = {}) {
    this._scope = scope;
    this._enabled = options.enabled ?? Logger._globalEnabled;
    this._sink = options.sink ?? console;
  }

  public static setGlobalEnabled(enabled: boolean): void {
    Logger._globalEnabled = enabled;
  }

  public static scoped(scope: string, options: LoggerOptions = {}): Logger {
    return new Logger(scope, options);
  }

  public child(scope: string): Logger {
    return new Logger(`${this._scope}:${scope}`, {
      enabled: this._enabled,
      sink: this._sink,
    });
  }

  public debug(...args: unknown[]): void {
    this._write("debug", args);
  }

  public info(...args: unknown[]): void {
    this._write("info", args);
  }

  public warn(...args: unknown[]): void {
    this._write("warn", args);
  }

  public error(...args: unknown[]): void {
    this._write("error", args);
  }

  private _write(level: LogLevel, args: unknown[]): void {
    if (!this._enabled) {
      return;
    }

    const writer = this._sink[level] ?? this._sink.info ?? this._sink.debug;
    writer?.(`[${this._scope}]`, ...args);
  }
}
