import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavSidebar } from './nav-sidebar';

@Component({ selector: 'app-stub-page', template: '' })
class StubPage {}

describe('NavSidebar', () => {
  let fixture: ComponentFixture<NavSidebar>;

  async function setup(
    expanded: boolean,
    versions?: { frontVersion?: string; apiVersion?: string },
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [NavSidebar],
      providers: [
        provideRouter([
          { path: 'rag', component: StubPage },
          { path: 'projects', component: StubPage },
          { path: 'reports', component: StubPage },
          { path: 'settings', component: StubPage },
        ]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NavSidebar);
    fixture.componentRef.setInput('expanded', expanded);
    if (versions?.frontVersion !== undefined) {
      fixture.componentRef.setInput('frontVersion', versions.frontVersion);
    }
    if (versions?.apiVersion !== undefined) {
      fixture.componentRef.setInput('apiVersion', versions.apiVersion);
    }
    fixture.detectChanges();
  }

  it('renders the four navigation links in order', async () => {
    await setup(true);
    const links = Array.from(fixture.nativeElement.querySelectorAll('nav a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Rag', 'Projects', 'Reports', 'Settings']);
  });

  it('shows text labels when expanded', async () => {
    await setup(true);
    expect(fixture.nativeElement.querySelector('aside').className).toContain('w-56');
    expect(fixture.nativeElement.textContent).toContain('Rag');
  });

  it('hides text labels and shows a title attribute when collapsed', async () => {
    await setup(false);
    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('w-16');

    const links = Array.from(fixture.nativeElement.querySelectorAll('nav a')) as HTMLAnchorElement[];
    expect(links.map((a) => a.textContent?.trim())).toEqual(['', '', '', '']);
    expect(links.map((a) => a.title)).toEqual(['Rag', 'Projects', 'Reports', 'Settings']);
  });

  describe('version footer', () => {
    it('renders nothing when both versions are empty', async () => {
      await setup(true);
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      expect(aside.querySelectorAll('span[title]').length).toBe(0);
    });

    it('renders only the front version when only it is set', async () => {
      await setup(true, { frontVersion: 'v1.2.3' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const spans = Array.from(aside.querySelectorAll('span[title]')) as HTMLElement[];
      expect(spans.map((s) => s.textContent?.trim())).toEqual(['v1.2.3']);
      expect(spans[0].title).toBe('Front-end version');
    });

    it('renders only the API version when only it is set', async () => {
      await setup(true, { apiVersion: '0.1.3-1' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const spans = Array.from(aside.querySelectorAll('span[title]')) as HTMLElement[];
      expect(spans.map((s) => s.textContent?.trim())).toEqual(['0.1.3-1']);
      expect(spans[0].title).toBe('API version');
    });

    it('stacks both versions vertically, front first, when collapsed', async () => {
      await setup(false, { frontVersion: 'v1.2.3', apiVersion: '0.1.3-1' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const footer = aside.querySelector('span[title]')?.parentElement as HTMLElement;
      expect(footer.className).toContain('flex-col');

      const spans = Array.from(footer.querySelectorAll('span[title]')) as HTMLElement[];
      expect(spans.map((s) => s.textContent?.trim())).toEqual(['v1.2.3', '0.1.3-1']);
    });

    it('lays out both versions side by side, right-aligned, front first, when expanded', async () => {
      await setup(true, { frontVersion: 'v1.2.3', apiVersion: '0.1.3-1' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const footer = aside.querySelector('span[title]')?.parentElement as HTMLElement;
      expect(footer.className).toContain('flex-row');
      expect(footer.className).toContain('justify-end');

      const spans = Array.from(footer.querySelectorAll('span[title]')) as HTMLElement[];
      expect(spans.map((s) => s.textContent?.trim())).toEqual(['v1.2.3', '0.1.3-1']);
    });

    it('shows a separator between the two versions when expanded', async () => {
      await setup(true, { frontVersion: 'v1.2.3', apiVersion: '0.1.3-1' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const footer = aside.querySelector('span[title]')?.parentElement as HTMLElement;
      expect(footer.textContent?.trim()).toBe('v1.2.3|0.1.3-1');
    });

    it('omits the separator when collapsed, even with both versions set', async () => {
      await setup(false, { frontVersion: 'v1.2.3', apiVersion: '0.1.3-1' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const footer = aside.querySelector('span[title]')?.parentElement as HTMLElement;
      expect(footer.textContent).not.toContain('|');
    });

    it('omits the separator when expanded but only one version is set', async () => {
      await setup(true, { frontVersion: 'v1.2.3' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const footer = aside.querySelector('span[title]')?.parentElement as HTMLElement;
      expect(footer.textContent).not.toContain('|');
    });

    it('anchors the footer to the bottom of the drawer', async () => {
      await setup(true, { frontVersion: 'v1.2.3', apiVersion: '0.1.3-1' });
      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      const footer = aside.querySelector('span[title]')?.parentElement as HTMLElement;
      expect(footer.className).toContain('mt-auto');
    });
  });
});
