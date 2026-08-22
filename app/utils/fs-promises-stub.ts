export async function readFile(): Promise<string> {
  return '';
}

export async function readdir(): Promise<string[]> {
  return [];
}

export async function writeFile(): Promise<void> {}

export async function mkdir(): Promise<void> {}

export async function rename(): Promise<void> {}

export async function unlink(): Promise<void> {}

export default { readFile, readdir, writeFile, mkdir, rename, unlink };
