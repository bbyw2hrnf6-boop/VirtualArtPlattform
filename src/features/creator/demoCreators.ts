import type {
  CreatorPost,
  PublicCreatorDirectoryEntry,
  PublicCreatorPayload,
} from "../../services/creatorProfile";

type DemoCreator = PublicCreatorDirectoryEntry & {
  demo: true;
  bio: string;
  posts: CreatorPost[];
};

const demoCreator = (
  handle: string,
  displayName: string,
  bio: string,
  followerCount: number,
  body: string,
  createdAt: string,
): DemoCreator => ({
  handle,
  displayName,
  bio,
  imagePresent: false,
  followerCount,
  demo: true,
  posts: [{
    id: `demo-${handle}-01`,
    handle,
    displayName,
    body,
    createdAt,
    reactionCount: Math.max(2, Math.round(followerCount / 9)),
    commentCount: Math.max(1, Math.round(followerCount / 32)),
    demo: true,
  }],
});

/** Editorial preview fixtures. These are intentionally not Firebase accounts. */
export const DEMO_CREATORS: DemoCreator[] = [
  demoCreator(
    "mira-vale",
    "Mira Vale",
    "Light, memory and slow-moving spatial studies between Lisbon and Rotterdam.",
    128,
    "Testing a softer threshold for Nocturne: reflected light first, artwork second. The new study is almost ready to walk through.",
    "2026-08-27T12:40:00.000Z",
  ),
  demoCreator(
    "atlas-studio",
    "Atlas Studio",
    "A collaborative practice for digital scenography, typography and public culture.",
    94,
    "We opened the working notes for Common Ground — three rooms, one changing archive and a deliberately quiet entrance.",
    "2026-08-27T10:15:00.000Z",
  ),
  demoCreator(
    "noor-patel",
    "Noor Patel",
    "Image-maker and researcher building intimate exhibitions around found materials.",
    76,
    "A small update from the studio: six new fragments are now arranged as a guided sequence rather than a conventional wall hang.",
    "2026-08-26T18:10:00.000Z",
  ),
  demoCreator(
    "common-field",
    "Common Field",
    "An independent curatorial platform for emerging spatial and moving-image practices.",
    211,
    "This week we are following process, not polish. Our feed will collect room tests, installation decisions and what changed between versions.",
    "2026-08-26T14:30:00.000Z",
  ),
  demoCreator(
    "elian-ross",
    "Elian Ross",
    "Sculptural environments, synthetic landscapes and experiments in digital materiality.",
    63,
    "The Pavilion study now holds its atmosphere on mobile. I reduced the scene to the few gestures the work actually needs.",
    "2026-08-25T16:05:00.000Z",
  ),
];

export const DEMO_CREATOR_POSTS = DEMO_CREATORS
  .flatMap((creator) => creator.posts)
  .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

export function isDemoCreatorHandle(handle: string) {
  return DEMO_CREATORS.some((creator) => creator.handle === handle.toLowerCase());
}

export function demoCreatorPayload(handle: string): PublicCreatorPayload | null {
  const creator = DEMO_CREATORS.find((candidate) => candidate.handle === handle.toLowerCase());
  if (!creator) return null;
  return {
    schemaVersion: 1,
    profile: {
      handle: creator.handle,
      displayName: creator.displayName,
      bio: creator.bio,
      links: [],
      profilePublic: true,
      imagePresent: false,
      coverPresent: false,
      bioFont: "sans",
      profileTone: "paper",
      followerCount: creator.followerCount,
      demo: true,
    },
    spaces: [],
    posts: creator.posts,
  };
}
