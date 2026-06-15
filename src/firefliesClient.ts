import 'dotenv/config';
import { validateEnv, sleep } from './utils';
import type { FirefliesTranscript } from './meetingPrompt';

const GRAPHQL_URL = 'https://api.fireflies.ai/graphql';

async function gql(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const apiKey = process.env.FIREFLIES_API_KEY!;
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 429) {
    console.warn('⚠  Fireflies rate limit (429). Aguardando 60s...');
    await sleep(60_000);
    return gql(query, variables);
  }

  const json = (await res.json()) as { data?: unknown; errors?: unknown[] };
  if (json.errors?.length) throw new Error(`Fireflies API error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export async function getTranscript(transcriptId: string): Promise<FirefliesTranscript> {
  const query = `
    query Transcript($transcriptId: String!) {
      transcript(id: $transcriptId) {
        id title dateString duration participants
        organizer_email meeting_link transcript_url
        speakers { id name }
        sentences { index speaker_name text start_time end_time }
        summary { gist bullet_gist overview short_summary action_items keywords }
      }
    }
  `;
  const data = (await gql(query, { transcriptId })) as { transcript: FirefliesTranscript };
  return data.transcript;
}

export async function deleteTranscript(id: string): Promise<boolean> {
  const mutation = `
    mutation DeleteTranscript($id: String!) {
      deleteTranscript(id: $id) { id title duration date }
    }
  `;
  try {
    await gql(mutation, { id });
    return true;
  } catch (e) {
    console.error('❌ Erro ao deletar transcript do Fireflies:', (e as Error).message);
    return false;
  }
}

if (process.argv.includes('--test')) {
  validateEnv(['FIREFLIES_API_KEY']);
  console.log('✅ Fireflies client carregado. Configure um transcriptId real para testar.');
}
