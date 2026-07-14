// API client + types for the word-of-the-day widget's backend
// (internal/widgets/word). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface WordOfTheDay {
  day: string; // YYYY-MM-DD, the server's local date
  word: string;
  pos: string; // part of speech
  definition: string;
  example: string;
}

export const getToday = () => apiFetch<WordOfTheDay>("/api/widgets/word/today");
