import { getCollection } from 'astro:content';

export async function getMembers() {
  const members = await getCollection('users');
  return members.sort((a, b) => a.data.order - b.data.order);
}
