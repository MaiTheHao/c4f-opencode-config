import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';

const FRONTMATTER = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/;

export function parseSkillSource(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return undefined;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const value = pair[2].trim();
    fields[pair[1]] = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }
  const content = text.slice(match[0].length).trim();
  if (!fields.name || !content) return undefined;
  return { name: fields.name, description: fields.description, content };
}

export function defaultSkillPath() {
  return join(homedir(), '.config', 'opencode', 'skills', 'c4f-update', 'SKILL.md');
}

/** Directories the runtime scans on its own. A skill there needs no mapping. */
export function discoveryRoots(home = homedir()) {
  return [join(home, '.agents', 'skills'), join(home, '.config', 'opencode', 'skills'), join(process.cwd(), '.opencode', 'skills')];
}

export function isDiscoverable(skillPath, roots = discoveryRoots()) {
  return roots.some((root) => skillPath === root || skillPath.startsWith(root + sep));
}

/**
 * Register the update skill when the runtime did not discover it on its own.
 * Discovery normally wins; this is the fallback that keeps the skill mapped
 * even when the skills directory is outside the runtime's search path.
 */
export async function mapUpdateSkill(ctx, { skillPath = defaultSkillPath(), skillId = 'c4f-update' } = {}) {
  if (typeof ctx?.skill?.transform !== 'function') return { mapped: false, reason: 'no skill.transform' };

  // Discovery usually wins: the skill lives in the config skills directory, so
  // registering it again would duplicate the entry in the model's skill list.
  if (typeof ctx.skill.list === 'function') {
    try {
      const listed = await ctx.skill.list();
      const skills = Array.isArray(listed) ? listed : (listed?.data ?? []);
      if (skills.some((skill) => skill.id === skillId || skill.name === skillId)) {
        return { mapped: false, reason: 'discovered' };
      }
    } catch {
      // Fall through to transform: discovery failed, so the fallback matters.
    }
  }

  let source;
  try {
    source = parseSkillSource(await readFile(skillPath, 'utf8'));
  } catch {
    source = undefined;
  }
  if (!source) return { mapped: false, reason: 'skill file unreadable' };
  if (isDiscoverable(skillPath)) return { mapped: false, reason: 'discoverable' };

  let mapped = false;
  await ctx.skill.transform((editor) => {
    const existing = editor.list().some((skill) => skill.id === skillId || skill.name === skillId || skill.name === source.name || (typeof skill.path === 'string' && skill.path.endsWith('/c4f-update/SKILL.md')));
    if (existing) return;
    editor.add({
      id: skillId,
      name: source.name,
      description: source.description,
      path: skillPath,
      content: source.content,
      autoinvoke: true,
    });
    mapped = true;
  });
  return { mapped, reason: mapped ? 'registered' : 'already present' };
}
