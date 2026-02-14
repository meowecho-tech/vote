export type Candidate = {
  id: string;
  name: string;
  manifesto?: string | null;
};

export type BallotResponse = {
  data: {
    election_id: string;
    title: string;
    status: string;
    candidates: Candidate[];
  };
};

export type VoteReceipt = {
  data: {
    receipt_id: string;
    election_id: string;
    submitted_at: string;
  };
};

export type ElectionDetail = {
  data: {
    id: string;
    title: string;
    description?: string | null;
    status: "draft" | "published" | "closed";
    opens_at: string;
    closes_at: string;
    candidate_count: number;
    voter_count: number;
  };
};

export type ElectionSummary = {
  id: string;
  title: string;
  description?: string | null;
  status: "draft" | "published" | "closed";
  opens_at: string;
  closes_at: string;
  candidate_count: number;
  voter_count: number;
};

export type PaginationMeta = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

export type ElectionListResponse = {
  data: {
    elections: ElectionSummary[];
    pagination: PaginationMeta;
  };
};

export type VotableElectionSummary = {
  id: string;
  title: string;
  description?: string | null;
  status: "draft" | "published" | "closed";
  opens_at: string;
  closes_at: string;
  candidate_count: number;
  has_voted: boolean;
  can_vote_now: boolean;
};

export type VotableElectionListResponse = {
  data: {
    elections: VotableElectionSummary[];
  };
};

export type CandidateListResponse = {
  data: {
    candidates: Candidate[];
    pagination: PaginationMeta;
  };
};

export type VoterRollEntry = {
  user_id: string;
  email: string;
  full_name: string;
};

export type VoterRollResponse = {
  data: {
    voters: VoterRollEntry[];
    pagination: PaginationMeta;
  };
};

export type VoterRollImportIssue = {
  row: number;
  identifier: string;
  reason: "user_not_found" | "duplicate_in_payload" | "already_in_roll";
};

export type VoterRollImportReport = {
  data: {
    dry_run: boolean;
    total_rows: number;
    valid_rows: number;
    inserted_rows: number;
    duplicate_rows: number;
    already_in_roll_rows: number;
    not_found_rows: number;
    issues: VoterRollImportIssue[];
  };
};

export type ElectionResultsResponse = {
  data: {
    election_id: string;
    results: {
      candidate_id: string;
      name: string;
      total: number;
    }[];
  };
};

export type Organization = {
  id: string;
  name: string;
};

export type OrganizationListResponse = {
  data: {
    organizations: Organization[];
  };
};
