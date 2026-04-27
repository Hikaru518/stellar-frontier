import type { DiaryEntryDefinition } from "./content/contentData";
import type { CrewMember } from "./data/gameData";

interface DiaryDraft {
  entryId: string;
  triggerNode: string;
  gameSecond: number;
  text: string;
}

export function appendDiaryEntryId(entryIds: string[], entryId: string) {
  return entryIds.includes(entryId) ? entryIds : [...entryIds, entryId];
}

export function appendDiaryEntry(member: CrewMember, draft: DiaryDraft): CrewMember {
  if (member.diaryEntries.some((entry) => entry.entryId === draft.entryId)) {
    return member;
  }

  const entry: DiaryEntryDefinition = {
    ...draft,
    availability: member.canCommunicate && !member.unavailable ? "delivered" : "lostBlocked",
  };

  return {
    ...member,
    diaryEntries: [...member.diaryEntries, entry],
  };
}

export function getVisibleDiaryEntries(member: CrewMember) {
  return member.diaryEntries.map((entry) => ({
    ...entry,
    visible: entry.availability === "delivered" || entry.availability === "recovered",
  }));
}

export function getDiaryAvailabilityLabel(availability: DiaryEntryDefinition["availability"]) {
  switch (availability) {
    case "delivered":
      return "已传回";
    case "pending":
      return "未传回";
    case "lostBlocked":
      return "失联锁定";
    case "recovered":
      return "找回解锁";
    default:
      return "未知状态";
  }
}
