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
