import { Ballot } from "@/components/voter/ballot";
import { getBallot } from "@/lib/api";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function VoterElectionPage({ params }: PageProps) {
  const { id } = await params;
  const ballot = await getBallot(id);

  return (
    <main className="mx-auto max-w-3xl">
      <Ballot
        electionId={ballot.data.election_id}
        electionTitle={ballot.data.title}
        candidates={ballot.data.candidates}
      />
    </main>
  );
}
