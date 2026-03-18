import {
  Color3,
  Color4,
  type DirectionalLight,
  type HemisphericLight,
  type Scene,
  Vector3,
} from "@babylonjs/core";

interface ColorLike {
  r: number;
  g: number;
  b: number;
}

export interface DayNightCycleOptions {
  cycleDurationSeconds?: number;
  startTimeOfDay?: number;
  zoneAmbientColor?: ColorLike;
}

export interface DayNightState {
  timeOfDay: number;
  clockHours: number;
  clockLabel: string;
  phaseLabel: "DAY" | "DAWN" | "DUSK" | "NIGHT";
  daylight: number;
  twilight: number;
  isNight: boolean;
  clearColor: Color4;
  hemiDiffuse: Color3;
  hemiGround: Color3;
  hemiIntensity: number;
  sunDiffuse: Color3;
  sunIntensity: number;
  sunDirection: Vector3;
  sunPosition: Vector3;
}

const TAU = Math.PI * 2;
const DEFAULT_ZONE_AMBIENT = new Color3(0.72, 0.78, 0.9);
const DEFAULT_TARGET = new Vector3(0, 8, 0);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function wrap01(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mixColor(a: ColorLike, b: ColorLike, t: number): Color3 {
  return new Color3(
    lerp(a.r, b.r, t),
    lerp(a.g, b.g, t),
    lerp(a.b, b.b, t),
  );
}

function brighten(color: ColorLike, amount: number): Color3 {
  return mixColor(color, { r: 1, g: 1, b: 1 }, clamp01(amount));
}

function tint(color: ColorLike, tintColor: ColorLike, amount: number): Color3 {
  return mixColor(color, tintColor, clamp01(amount));
}

function cloneColor(color?: ColorLike | null): Color3 {
  if (!color) return DEFAULT_ZONE_AMBIENT.clone();
  return new Color3(color.r, color.g, color.b);
}

export function formatClockHours(clockHours: number): string {
  const totalMinutes = Math.floor(wrap01(clockHours / 24) * 24 * 60);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

export function computeDayNightState(timeOfDay: number, zoneAmbientColor?: ColorLike | null): DayNightState {
  const normalizedTime = wrap01(timeOfDay);
  const orbit = normalizedTime * TAU - Math.PI / 2;
  const solarAltitude = Math.sin(orbit);
  const daylight = smoothstep(-0.16, 0.14, solarAltitude);
  const horizonGlow = Math.pow(Math.max(0, 1 - Math.abs(solarAltitude) / 0.58), 1.75);
  const twilightPeak = 1 - Math.abs(daylight * 2 - 1);
  const twilight = clamp01(horizonGlow * twilightPeak * 1.15);
  const isNight = daylight < 0.18;
  const baseAmbient = cloneColor(zoneAmbientColor);

  const daySky = brighten(tint(baseAmbient, new Color3(0.38, 0.7, 1.0), 0.5), 0.12);
  const twilightSky = tint(baseAmbient, new Color3(1.0, 0.52, 0.24), 0.58);
  const nightSky = tint(baseAmbient, new Color3(0.03, 0.06, 0.18), 0.84);

  let skyColor = mixColor(nightSky, daySky, daylight);
  skyColor = mixColor(skyColor, twilightSky, twilight * 0.88);

  const hemiDay = brighten(tint(baseAmbient, new Color3(0.9, 0.96, 1.0), 0.32), 0.08);
  const hemiNight = new Color3(0.16, 0.22, 0.42);
  let hemiDiffuse = mixColor(hemiNight, hemiDay, daylight);
  hemiDiffuse = mixColor(hemiDiffuse, new Color3(0.98, 0.72, 0.56), twilight * 0.2);

  const groundDay = tint(baseAmbient, new Color3(0.2, 0.24, 0.38), 0.5);
  const groundNight = new Color3(0.04, 0.06, 0.12);
  const hemiGround = mixColor(groundNight, groundDay, daylight + twilight * 0.15);

  const sunDay = new Color3(1.0, 0.97, 0.92);
  const sunTwilight = new Color3(1.0, 0.62, 0.4);
  const moonTint = new Color3(0.52, 0.66, 0.95);
  let sunDiffuse = mixColor(moonTint, sunDay, daylight);
  sunDiffuse = mixColor(sunDiffuse, sunTwilight, twilight * 0.9);

  const activeOrbit = solarAltitude >= 0 ? orbit : orbit + Math.PI;
  const sunPosition = new Vector3(
    Math.cos(activeOrbit) * 86,
    28 + Math.max(0, Math.sin(activeOrbit)) * 78,
    Math.sin(activeOrbit * 0.82) * 42 - 12,
  );
  const sunDirection = DEFAULT_TARGET.subtract(sunPosition).normalize();

  let phaseLabel: DayNightState["phaseLabel"] = "DAY";
  if (daylight < 0.18) {
    phaseLabel = "NIGHT";
  } else if (twilight > 0.22 && solarAltitude >= 0) {
    phaseLabel = "DAWN";
  } else if (twilight > 0.22 && solarAltitude < 0) {
    phaseLabel = "DUSK";
  }

  const clockHours = normalizedTime * 24;

  return {
    timeOfDay: normalizedTime,
    clockHours,
    clockLabel: formatClockHours(clockHours),
    phaseLabel,
    daylight,
    twilight,
    isNight,
    clearColor: new Color4(skyColor.r, skyColor.g, skyColor.b, 1),
    hemiDiffuse,
    hemiGround,
    hemiIntensity: lerp(0.38, 1.22, daylight) + twilight * 0.18,
    sunDiffuse,
    sunIntensity: lerp(0.24, 1.92, daylight) + twilight * 0.14,
    sunDirection,
    sunPosition,
  };
}

export class DayNightCycleController {
  private readonly scene: Scene;
  private readonly hemiLight: HemisphericLight;
  private readonly sunLight: DirectionalLight;
  private readonly cycleDurationSeconds: number;
  private timeOfDay: number;
  private zoneAmbientColor: Color3;
  private currentState: DayNightState;

  public constructor(
    scene: Scene,
    hemiLight: HemisphericLight,
    sunLight: DirectionalLight,
    options: DayNightCycleOptions = {},
  ) {
    this.scene = scene;
    this.hemiLight = hemiLight;
    this.sunLight = sunLight;
    this.cycleDurationSeconds = Math.max(30, options.cycleDurationSeconds ?? 360);
    this.timeOfDay = wrap01(options.startTimeOfDay ?? 0.3);
    this.zoneAmbientColor = cloneColor(options.zoneAmbientColor);
    this.currentState = computeDayNightState(this.timeOfDay, this.zoneAmbientColor);
    this.apply();
  }

  public update(deltaSeconds: number): DayNightState {
    if (deltaSeconds > 0) {
      this.timeOfDay = wrap01(this.timeOfDay + deltaSeconds / this.cycleDurationSeconds);
    }
    return this.apply();
  }

  public setZoneEnvironment(zone: { ambientColor?: ColorLike | null } | null | undefined): DayNightState {
    this.zoneAmbientColor = cloneColor(zone?.ambientColor);
    return this.apply();
  }

  public setTimeOfDay(timeOfDay: number): DayNightState {
    this.timeOfDay = wrap01(timeOfDay);
    return this.apply();
  }

  public getState(): DayNightState {
    return this.currentState;
  }

  private apply(): DayNightState {
    this.currentState = computeDayNightState(this.timeOfDay, this.zoneAmbientColor);

    this.scene.clearColor.copyFrom(this.currentState.clearColor);
    this.hemiLight.intensity = this.currentState.hemiIntensity;
    this.hemiLight.diffuse.copyFrom(this.currentState.hemiDiffuse);
    this.hemiLight.groundColor.copyFrom(this.currentState.hemiGround);

    this.sunLight.position.copyFrom(this.currentState.sunPosition);
    this.sunLight.direction.copyFrom(this.currentState.sunDirection);
    this.sunLight.intensity = this.currentState.sunIntensity;
    this.sunLight.diffuse.copyFrom(this.currentState.sunDiffuse);
    this.sunLight.specular.copyFrom(this.currentState.sunDiffuse);

    this.scene.metadata = {
      ...(this.scene.metadata ?? {}),
      environment: {
        phase: this.currentState.phaseLabel,
        clockLabel: this.currentState.clockLabel,
        timeOfDay: this.currentState.timeOfDay,
        daylight: this.currentState.daylight,
        twilight: this.currentState.twilight,
        isNight: this.currentState.isNight,
      },
      zoneEnvironment: {
        ...(this.scene.metadata?.zoneEnvironment ?? {}),
        ambientColor: {
          r: this.zoneAmbientColor.r,
          g: this.zoneAmbientColor.g,
          b: this.zoneAmbientColor.b,
        },
      },
    };

    return this.currentState;
  }
}