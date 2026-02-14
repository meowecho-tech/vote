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

export type ElectionListResponse = {
  data: {
    elections: ElectionSummary[];
  };
};

export type CandidateListResponse = {
  data: {
    candidates: Candidate[];
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
