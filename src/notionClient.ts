import 'dotenv/config';
import { Client } from '@notionhq/client';
import type { MeetingOutput } from './meetingPrompt';
import { validateEnv, sleep, getSprintInfo } from './utils';

function getClient() {
  validateEnv(['NOTION_TOKEN']);
  return new Client({ auth: process.env.NOTION_TOKEN });
}

const NOTION_MAX = 1800;

function rt(text: string) {
  return [{ text: { content: (text ?? '').slice(0, NOTION_MAX) } }];
}

function safeText(text: string | null | undefined): string {
  return (text ?? '').slice(0, NOTION_MAX);
}


async function findOrCreatePage(notion: Client, parentId: string, title: string): Promise<string> {
  await sleep(340);
  const res = await notion.blocks.children.list({ block_id: parentId });
  for (const block of res.results) {
    const b = block as { type?: string; child_page?: { title: string }; id: string };
    if (b.type === 'child_page' && b.child_page?.title === title) return b.id;
  }
  await sleep(340);
  const page = await notion.pages.create({
    parent: { page_id: parentId },
    properties: { title: { title: rt(title) } },
  });
  return page.id;
}

export async function createAtaPage(
  meetingTitle: string,
  dateStr: string,
  minutes: MeetingOutput,
  googleDocId: string,
  isPrivate = false,
  transcriptDocId?: string | null
): Promise<string> {
  const notion     = getClient();
  const rootPageId = process.env.NOTION_PARENT_PAGE_ID;
  if (!rootPageId) throw new Error('Configure NOTION_PARENT_PAGE_ID no .env');

  // Reuniões de coordenação vão para uma página raiz separada (privada no Notion)
  const coordRootPageId = process.env.NOTION_COORD_PAGE_ID;
  const effectiveRootId = isPrivate && coordRootPageId ? coordRootPageId : rootPageId;

  const { sprint, weekLabel } = getSprintInfo(dateStr);
  const sprintTitle = `Sprint ${sprint}`;

  const sprintPageId = await findOrCreatePage(notion, effectiveRootId, sprintTitle);
  const weekPageId   = await findOrCreatePage(notion, sprintPageId, weekLabel);

  const [, month, day] = dateStr.split('-');
  const ataTitle = `${day}/${month} — ${meetingTitle}`;
  const docUrl   = `https://docs.google.com/document/d/${googleDocId}`;

  await sleep(340);
  const page = await notion.pages.create({
    parent: { page_id: weekPageId },
    properties: { title: { title: rt(ataTitle) } },
  });
  const pageId = page.id;
  await sleep(340);

  type BlockChild = Parameters<typeof notion.blocks.children.append>[0]['children'][number];

  // Versão mínima: apenas callout com resumo + link pro Google Doc (2-3 blocos)
  const blocks: BlockChild[] = [
    {
      type: 'callout',
      callout: {
        rich_text: rt(
          `${minutes.tipo_reuniao || meetingTitle} · ${(minutes.participantes ?? []).join(', ')}\n\n` +
          `${safeText(minutes.resumo_executivo)}`
        ),
        icon: { type: 'emoji', emoji: '📋' },
      },
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          { text: { content: '📄 Ata completa: ' } },
          { text: { content: docUrl, link: { url: docUrl } } },
        ],
      },
    },
    ...(transcriptDocId ? [{
      type: 'paragraph' as const,
      paragraph: {
        rich_text: [
          { text: { content: '🎙 Transcrição: ' } },
          {
            text: {
              content: `https://docs.google.com/document/d/${transcriptDocId}`,
              link: { url: `https://docs.google.com/document/d/${transcriptDocId}` },
            },
          },
        ],
      },
    }] : []),
  ];

  // Notion: máx 100 blocos por request
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({ block_id: pageId, children: blocks.slice(i, i + 100) });
    if (i + 100 < blocks.length) await sleep(340);
  }

  console.log(`✅ Notion: ${sprintTitle} → ${weekLabel} → ${ataTitle}`);
  console.log(`   https://notion.so/${pageId.replace(/-/g, '')}`);
  return pageId;
}

if (process.argv.includes('--test')) {
  validateEnv(['NOTION_TOKEN']);
  const n = getClient();
  n.users.me({}).then(() => console.log('✅ Notion connection OK')).catch(e => console.error('❌', e.message));
}
