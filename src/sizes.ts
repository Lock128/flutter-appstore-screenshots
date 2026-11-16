export type Store = "apple" | "google";

export interface DevicePreset {
  name: string;
  store: Store;
  description: string;
  /** Output pixels */
  width: number;
  height: number;
  /** deviceScaleFactor, chosen so width/height divide evenly */
  scale: number;
  isMobile: boolean;
}

export const DEVICES: DevicePreset[] = [
  { name: "iphone-6.9", store: "apple", description: "iPhone 6.9in (16 Pro Max)", width: 1320, height: 2868, scale: 3, isMobile: true },
  { name: "iphone-6.5", store: "apple", description: "iPhone 6.5in (11 Pro Max, XS Max)", width: 1284, height: 2778, scale: 3, isMobile: true },
  { name: "iphone-5.5", store: "apple", description: "iPhone 5.5in (8 Plus)", width: 1242, height: 2208, scale: 3, isMobile: true },
  { name: "ipad-13", store: "apple", description: "iPad 13in (Pro M4)", width: 2064, height: 2752, scale: 2, isMobile: true },
  { name: "ipad-12.9", store: "apple", description: "iPad 12.9in (Pro 2nd gen)", width: 2048, height: 2732, scale: 2, isMobile: true },
  { name: "play-phone", store: "google", description: "Google Play phone", width: 1080, height: 1920, scale: 3, isMobile: true },
  { name: "play-tablet-7", store: "google", description: "Google Play 7in tablet", width: 1200, height: 1920, scale: 2, isMobile: true },
  { name: "play-tablet-10", store: "google", description: "Google Play 10in tablet", width: 1600, height: 2560, scale: 2, isMobile: true },
  { name: "play-feature-graphic", store: "google", description: "Google Play feature graphic", width: 1024, height: 500, scale: 1, isMobile: false },
];

export function viewportFor(d: DevicePreset): { width: number; height: number } {
  return { width: d.width / d.scale, height: d.height / d.scale };
}

export function findDevice(name: string): DevicePreset {
  const d = DEVICES.find((x) => x.name === name);
  if (!d) {
    throw new Error(`Unknown device "${name}". Available: ${DEVICES.map((x) => x.name).join(", ")}`);
  }
  return d;
}
