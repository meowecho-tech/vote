export type Candidate = {
  id: string;
  name: string;
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
