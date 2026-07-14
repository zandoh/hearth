// API client + types for the news widget's backend
// (internal/widgets/news). Go structs are the source of truth.

import { apiFetch } from "../api";

export interface Headline {
  title: string;
  source: string;
  publishedAt: string;
}

export interface TopicHeadlines {
  topic: string;
  fetchedAt: string;
  items: Headline[];
}

// {pending:true} until the backend's first fetch for this topic lands; the
// completed fetch announces itself on the news SSE topic.
export interface HeadlinesResponse {
  pending?: boolean;
  headlines?: TopicHeadlines;
}

export const getHeadlines = (topic: string) =>
  apiFetch<HeadlinesResponse>(`/api/widgets/news/headlines?topic=${encodeURIComponent(topic)}`);
