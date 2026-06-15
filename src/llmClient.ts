import 'dotenv/config';
import OpenAI from 'openai';
import { buildSystemPrompt, buildUserPrompt, MeetingOutput } from './meetingPrompt';
import type { FirefliesTranscript } from './meetingPrompt';
import { validateEnv } from './utils';

export async function generateMinutes(transcript: FirefliesTranscript): Promise<MeetingOutput> {
  validateEnv(['OPENAI_API_KEY']);
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model  = process.env.LLM_MODEL ?? 'gpt-4o';

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user',   content: buildUserPrompt(transcript) },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const raw    = completion.choices[0]?.message?.content ?? '{}';
  const result = JSON.parse(raw) as MeetingOutput;

  // Normaliza arrays — filtra entradas vazias/nulas
  const filterStr = (arr: unknown[]) =>
    (arr ?? []).filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

  result.participantes         = filterStr(result.participantes);
  result.pendencias_em_aberto  = filterStr(result.pendencias_em_aberto);
  result.pauta_proxima_reuniao = filterStr(result.pauta_proxima_reuniao);
  result.principais_pontos     = (result.principais_pontos ?? []).filter(p => p?.tema?.trim());
  result.decisoes_tomadas      = (result.decisoes_tomadas ?? []).filter(d => d?.decisao?.trim());
  result.pontos_de_atencao     = (result.pontos_de_atencao ?? []).filter(p => p?.ponto?.trim());
  result.proximas_acoes        = (result.proximas_acoes ?? []).filter(a => a?.acao?.trim());

  return result;
}
