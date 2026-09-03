import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NavSidebar } from './nav-sidebar';

@Component({ selector: 'app-stub-page', template: '' })
class StubPage {}

describe('NavSidebar', () => {
  let fixture: ComponentFixture<NavSidebar>;

  async function setup(expanded: boolean): Promise<void> {
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
});
