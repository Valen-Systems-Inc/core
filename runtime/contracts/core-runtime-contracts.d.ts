export type ValenCardStatus = "pending" | "focused" | "kept" | "approved" | "dismissed" | "archived" | string;

export type ValenCardBucket = "foreground" | "orbit" | "dismissed" | "archived";

export interface ValenSpatialState {
  space?: "foreground" | "orbit" | "dismissed" | "archived" | string;
  cluster?: string;
  emphasis?: "primary" | "secondary" | string;
  angle?: number;
  [key: string]: unknown;
}

export interface ValenCardData {
  eyebrow?: string;
  title?: string;
  body?: string;
  summary?: string;
  url?: string;
  action?: string;
  next_action?: string;
  approval_state?: "pending" | "approved" | "not_required" | string;
  [key: string]: unknown;
}

export interface ValenWorkspaceCard {
  id: string;
  sessionId?: string;
  session_id?: string;
  title: string;
  type?: string;
  card_type: string;
  status: ValenCardStatus;
  bucket?: ValenCardBucket;
  priority?: number;
  card_data: ValenCardData;
  spatial_state?: ValenSpatialState | null;
  idempotency_key?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ValenCardCounts {
  foreground: number;
  orbit: number;
  dismissed: number;
  archived: number;
  active: number;
  visible: number;
  total: number;
}

export interface GetCardsResponse {
  ok?: boolean;
  success?: boolean;
  sessionId?: string | number;
  session_id?: string | number;
  counts?: ValenCardCounts;
  summary?: Partial<ValenCardCounts>;
  foreground: ValenWorkspaceCard[];
  orbit: ValenWorkspaceCard[];
  dismissed?: ValenWorkspaceCard[];
  archived?: ValenWorkspaceCard[];
  visibleCards?: ValenWorkspaceCard[];
}

export interface ProcessCardActionRequest {
  sessionId: string | number;
  cardId: string;
  action: "keep" | "dismiss" | "recall" | "approve" | "select" | "change" | "answer" | "show_more" | string;
  verb?: string;
  payload?: Record<string, unknown>;
}

export interface RuntimeStatusReport {
  sessionId: string | number;
  phase?: "WorkspaceMode" | string;
  scene?: string;
  activeCard?: string;
  activeObjectId?: string;
  release?: string;
  bridgeReady?: boolean;
  domMirrorReady?: boolean;
  totalCardCount?: number;
  foregroundCount?: number;
  orbitCount?: number;
  visibleCards?: Array<Pick<ValenWorkspaceCard, "id" | "type" | "status" | "bucket">>;
  reportedAt?: string;
  [key: string]: unknown;
}

export interface GetRuntimeStatusResponse {
  ok: boolean;
  sessionId: string | number;
  phase?: string;
  scene?: string;
  counts: ValenCardCounts;
  foreground: ValenWorkspaceCard[];
  orbit: ValenWorkspaceCard[];
  dismissed: ValenWorkspaceCard[];
  archived: ValenWorkspaceCard[];
  visibleCards: ValenWorkspaceCard[];
  latestRuntimeReport?: RuntimeStatusReport | null;
  reportIsStale?: boolean;
  truthSource: string;
}

export interface ValenWorkspaceBridge {
  version?: string;
  bridgeVersion?: string;
  init(): string | number;
  getHookSessionId(): string | number;
  loadCards(): Promise<GetCardsResponse>;
  action(cardId: string, action: ProcessCardActionRequest["action"], payload?: Record<string, unknown>): Promise<unknown>;
  upsertCard(card: Partial<ValenWorkspaceCard>, payload?: Record<string, unknown>): Promise<unknown>;
  bulkUpsertCards(cards: Partial<ValenWorkspaceCard>[], payload?: Record<string, unknown>): Promise<unknown>;
  createBusinessStarterCards(payload?: Record<string, unknown>): Promise<unknown>;
  loadCapabilities(payload?: Record<string, unknown>): Promise<unknown>;
  queueCapabilityWorkObject(payload?: Record<string, unknown>): Promise<unknown>;
  reportStatus(status?: Partial<RuntimeStatusReport>): Promise<unknown>;
  getStatus(sessionId?: string | number): Promise<GetRuntimeStatusResponse>;
  chat(message: string, onChunk?: (text: string) => void, onComplete?: (text: string) => void): Promise<string | { text?: string }>;
  keep(cardId: string): Promise<unknown>;
  dismiss(cardId: string): Promise<unknown>;
  recall(cardId: string): Promise<unknown>;
  approve(cardId: string, payload?: Record<string, unknown>): Promise<unknown>;
}

declare global {
  interface Window {
    ValenWorkspace?: ValenWorkspaceBridge;
  }
}
