export interface UserProfile {
  nickname: string;
  age: number | null;
  city: string;
  gender: string;
  lookingFor: string;
  interests: string[];
  personalityTags: string[];
  bio: string;
  preferences: {
    ageRange: [number, number];
    cities: string[];
    mustHaveTags: string[];
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

export interface Candidate {
  id: string;
  name: string;
  age: number;
  city: string;
  gender: string;
  avatarSeed: string;
  interests: string[];
  personalityTags: string[];
  bio: string;
  occupation: string;
}

export const EMPTY_PROFILE: UserProfile = {
  nickname: "",
  age: null,
  city: "",
  gender: "",
  lookingFor: "",
  interests: [],
  personalityTags: [],
  bio: "",
  preferences: {
    ageRange: [22, 40],
    cities: [],
    mustHaveTags: [],
  },
};
