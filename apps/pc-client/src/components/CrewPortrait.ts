import type { CrewMember } from "../data/gameData";
import alicePortraitUrl from "../assets/crew/alice-portrait.png";
import mikePortraitUrl from "../assets/crew/mike-portrait.png";
import simonPortraitUrl from "../assets/crew/simon-portrait.png";

export interface CrewPortraitImage {
  src: string;
  alt: string;
}

export function getCrewPortraitImage(member: CrewMember): CrewPortraitImage | null {
  if (!member.portrait) {
    return null;
  }

  const src = crewPortraitUrls[member.portrait.image];
  if (!src) {
    return null;
  }

  return {
    src,
    alt: member.portrait.alt ?? `${member.name} 头像`,
  };
}

const crewPortraitUrls: Record<string, string> = {
  "alice-portrait.png": alicePortraitUrl,
  "mike-portrait.png": mikePortraitUrl,
  "simon-portrait.png": simonPortraitUrl,
};

export function buildCrewPortrait(member: CrewMember, runtime: boolean) {
  const accent = runtime ? "RUNTIME" : "FIELD";
  return [
    frameTop("CREW PORTRAIT", 20),
    frameLine(member.name.toUpperCase(), 20),
    frameLine("", 20),
    frameLine("     .-''''''-.", 20),
    frameLine("   .'  .--.   '.", 20),
    frameLine("  /   / __ \\\\   \\\\", 20),
    frameLine(" |   | /  \\\\ |   |", 20),
    frameLine(" |   | |  | |   |", 20),
    frameLine(" |   | |__| |   |", 20),
    frameLine("  \\\\   \\\\____/   /", 20),
    frameLine("   '._  __  _.-'", 20),
    frameLine("      \\\\/__\\\\/", 20),
    frameLine(`TAG ${accent}`, 20),
    frameLine("VOX TIGHT / LOW", 20),
  ];
}

function frameTop(label: string, innerWidth: number) {
  const core = `-[${label}]-`;
  return `+${core}${"-".repeat(Math.max(0, innerWidth - core.length))}+`;
}

function frameLine(text: string, innerWidth: number) {
  return `|${text.padEnd(innerWidth, " ")}|`;
}
