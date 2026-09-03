import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage } from './home-page';

describe('HomePage', () => {
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
  });

  it('renders a welcome heading', () => {
    expect(fixture.nativeElement.textContent).toContain('Welcome to CodeRAG');
  });

  it('links to all four sections', () => {
    const labels = Array.from(fixture.nativeElement.querySelectorAll('a span:first-child')) as HTMLElement[];
    expect(labels.map((el) => el.textContent?.trim())).toEqual(['Rag', 'Projects', 'Reports', 'Settings']);
  });
});
