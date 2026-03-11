import { IsString, IsNumber, IsOptional, IsIn, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type ChromeWindowMode = 'kiosk' | 'app' | 'fullscreen' | 'default';
const CHROME_WINDOW_MODES: ChromeWindowMode[] = ['kiosk', 'app', 'fullscreen', 'default'];

export class ChromeConfig {
  @IsString()
  path!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  devToolsPort?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  readyTimeout?: number;

  @IsOptional()
  @IsIn(CHROME_WINDOW_MODES)
  windowMode?: ChromeWindowMode;

  @IsOptional()
  @IsString()
  userDataDir?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7680)
  windowWidth?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7680)
  windowHeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(-16384)
  @Max(16384)
  windowPositionX?: number;

  @IsOptional()
  @IsNumber()
  @Min(-16384)
  @Max(16384)
  windowPositionY?: number;
}

export class ObsConfig {
  @IsString()
  path!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  readyTimeout?: number;

  @IsOptional()
  @IsString()
  profilePath?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  password?: string;
}

/** Returns true if OBS WebSocket (scenes) is enabled: host, port and password are set (password may be empty string). */
export function isObsScenesEnabled(obs: ObsConfig): boolean {
  return (
    obs.host != null &&
    obs.host !== '' &&
    obs.port != null &&
    obs.password !== undefined
  );
}

export class TelegramConfig {
  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedUsers?: string[];
}

export class IdleConfig {
  @IsNumber()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  viewsPath!: string;
}

export class WatchdogConfig {
  @IsOptional()
  @IsNumber()
  @Min(1)
  checkIntervalMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  restartMinIntervalMs?: number;
}

export class AppConfig {
  @IsIn(['info', 'warn', 'error', 'debug'])
  logLevel!: 'info' | 'warn' | 'error' | 'debug';

  @IsOptional()
  @IsString()
  lastUrlStatePath?: string;

  @ValidateNested()
  @Type(() => ChromeConfig)
  chrome!: ChromeConfig;

  @ValidateNested()
  @Type(() => ObsConfig)
  obs!: ObsConfig;

  @ValidateNested()
  @Type(() => TelegramConfig)
  telegram!: TelegramConfig;

  @ValidateNested()
  @Type(() => IdleConfig)
  idle!: IdleConfig;

  @ValidateNested()
  @Type(() => WatchdogConfig)
  watchdog!: WatchdogConfig;
}
