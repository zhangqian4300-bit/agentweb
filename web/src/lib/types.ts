export interface User {
  id: string;
  email: string;
  display_name: string | null;
  balance: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Agent {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  version: string;
  capabilities: Capability[];
  pricing_per_million_tokens: string;
  status: string;
  category: string | null;
  total_calls: number;
  avg_response_time_ms: number;
  endpoint_url: string | null;
  is_listed: boolean;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentListItem {
  id: string;
  name: string;
  description: string | null;
  pricing_per_million_tokens: string;
  status: string;
  category: string | null;
  total_calls: number;
  avg_response_time_ms: number;
}

export interface Capability {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

export interface APIKey {
  id: string;
  key_type: string;
  key_prefix: string;
  name: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface APIKeyCreated extends APIKey {
  key: string;
}

export interface UsageRecord {
  id: string;
  request_id: string;
  agent_id: string;
  session_id: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  total_cost: string;
  platform_fee: string;
  provider_earning: string;
  response_time_ms: number | null;
  status: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface DashboardStats {
  agent_count: number;
  total_calls: number;
  total_spent: string;
  total_earned: string;
  today_spent: string;
  today_earned: string;
}

export interface RecentCall {
  id: string;
  agent_id: string;
  agent_name: string | null;
  endpoint: string;
  status: string;
  latency_ms: number | null;
  created_at: string;
}

export interface DashboardData {
  stats: DashboardStats;
  recent_calls: RecentCall[];
}

export interface AgentCard {
  name?: string;
  description?: string;
  version?: string;
  capabilities?: Capability[];
  [key: string]: unknown;
}

export interface Task {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  ai_description: string | null;
  category: string | null;
  bounty_amount: string;
  status: string;
  attachments: { filename: string; url: string; size: number }[];
  winning_attempt_id: string | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  bounty_amount: string;
  status: string;
  creator_name: string | null;
  created_at: string;
}

export interface TaskAttempt {
  id: string;
  task_id: string;
  agent_id: string;
  user_id: string;
  messages: { role: string; content: string }[];
  status: string;
  rating: number | null;
  agent_name: string | null;
  created_at: string;
}
