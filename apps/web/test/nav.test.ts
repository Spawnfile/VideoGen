import { describe, expect, it } from 'vitest';
import { activeNav, activeTab, MOBILE_TABS, NAV_ITEMS, titleFor } from '../src/lib/nav.ts';

describe('navigation model', () => {
  it('phone tabs are Studio, Chat, Library and Settings', () => {
    expect(MOBILE_TABS.map((t) => t.label)).toEqual(['Studio', 'Chat', 'Library', 'Settings']);
    expect(NAV_ITEMS.map((t) => t.label)).toEqual(['Studio', 'Chat', 'Library', 'Audit log', 'Assets', 'Settings']);
  });

  it('maps every route to the phone tab that owns it', () => {
    expect(activeTab('/')).toBe('/');
    expect(activeTab('/chat')).toBe('/chat');
    expect(activeTab('/library')).toBe('/library');
    expect(activeTab('/library/abc')).toBe('/library');
    expect(activeTab('/settings')).toBe('/settings');
    expect(activeTab('/audit')).toBe('/settings');
    expect(activeTab('/assets')).toBe('/settings');
  });

  it('marks the rail item of a route, and nested library pages as Library', () => {
    expect(activeNav('/library/abc', '/library')).toBe(true);
    expect(activeNav('/', '/library')).toBe(false);
    expect(activeNav('/', '/')).toBe(true);
    expect(activeNav('/audit', '/audit')).toBe(true);
  });

  it('titles a route for the phone top bar', () => {
    expect(['/', '/chat', '/library', '/library/x', '/audit', '/assets', '/settings'].map(titleFor)).toEqual(['Studio', 'Chat', 'Library', 'Library', 'Audit log', 'Assets', 'Settings']);
  });
});
