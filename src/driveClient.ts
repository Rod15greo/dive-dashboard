import 'dotenv/config';
import * as fs from 'fs';
import { google } from 'googleapis';
import { validateEnv, getSprintInfo } from './utils';
import { getGoogleAuth } from './googleAuth';

export async function getDriveClient() {
  validateEnv(['GOOGLE_CREDENTIALS_PATH', 'GOOGLE_TOKEN_PATH']);
  const auth = await getGoogleAuth();
  return google.drive({ version: 'v3', auth });
}

export async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const res = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files?.length) return res.data.files[0].id!;

  const file = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return file.data.id!;
}

async function getFolderIdByPath(folderPath: string): Promise<string> {
  const drive = await getDriveClient();
  const rootId = process.env.DRIVE_ROOT_FOLDER_ID!;
  let parentId = rootId;
  for (const segment of folderPath.split('/')) {
    parentId = await findOrCreateFolder(drive, segment.trim(), parentId);
  }
  return parentId;
}

// Retorna a pasta Sprint N → Semana X correspondente à data da reunião.
// Docs de coordenação usam DRIVE_COORD_ROOT_FOLDER_ID (padrão: 'root' = Drive pessoal)
// para evitar herança de permissões do Drive compartilhado do time.
export async function getFolderForDate(dateStr: string, isPrivate: boolean): Promise<string> {
  const { sprintTitle, weekLabel } = getSprintInfo(dateStr);
  const drive = await getDriveClient();

  let parentId: string;
  if (isPrivate) {
    const coordRoot   = process.env.DRIVE_COORD_ROOT_FOLDER_ID ?? 'root';
    const coordFolder = process.env.DRIVE_COORD_FOLDER_NAME ?? 'Atas e Pautas Coordenação';
    parentId = await findOrCreateFolder(drive, coordFolder, coordRoot);
  } else {
    const rootId = process.env.DRIVE_ROOT_FOLDER_ID!;
    parentId = rootId;
    for (const segment of (process.env.DRIVE_ATAS_FOLDER_NAME ?? '01 - Gestão/Atas de reunião').split('/')) {
      parentId = await findOrCreateFolder(drive, segment.trim(), parentId);
    }
  }

  parentId = await findOrCreateFolder(drive, sprintTitle, parentId);
  parentId = await findOrCreateFolder(drive, weekLabel,   parentId);
  return parentId;
}

export async function getAtasFolderId(): Promise<string> {
  return getFolderIdByPath(process.env.DRIVE_ATAS_FOLDER_NAME ?? '01 - Gestão/Atas de reunião');
}

export async function getCoordFolderId(): Promise<string> {
  return getFolderIdByPath(process.env.DRIVE_COORD_FOLDER_NAME ?? 'Atas e Pautas Coordenação');
}

export async function moveFileToDrive(fileId: string, folderId: string): Promise<void> {
  const drive = await getDriveClient();
  const file = await drive.files.get({ fileId, fields: 'parents', supportsAllDrives: true });
  const previousParents = (file.data.parents ?? []).join(',');
  await drive.files.update({
    fileId,
    addParents: folderId,
    removeParents: previousParents,
    supportsAllDrives: true,
    fields: 'id, parents',
  });
}
