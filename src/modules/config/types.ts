import { IsString, IsNumber, IsOptional, IsIn, Min, Max, IsArray, ValidateNested, IsBoolean, IsNotEmpty, ArrayMinSize } from 'class-validator';
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
  @IsBoolean()
  kiosk?: boolean;

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

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  deviceScaleFactor?: number;

  @IsOptional()
  @IsString()
  ozonePlatform?: string;
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

  @IsString()
  @IsNotEmpty()
  host!: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  projectorMonitorName?: string;

  @IsOptional()
  @IsString()
  projectorSceneName?: string;

  @IsOptional()
  @IsString()
  outputSceneName?: string;
}

export class TelegramConfig {
  @IsString()
  @IsNotEmpty()
  botToken!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  allowedUsers!: string[];
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

  @IsOptional()
  @IsString()
  scenesConfigPath?: string;

  @IsOptional()
  @IsString()
  chromeScriptsDir?: string;

  @IsOptional()
  @IsString()
  chromeScriptsMap?: string;

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
