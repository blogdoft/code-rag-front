import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EscClearableDirective } from './esc-clearable.directive';

@Component({
  imports: [EscClearableDirective],
  template: `<input
    [appEscClearable]="value()"
    [appEscClearableDisabled]="disabled()"
    (cleared)="onCleared()"
  />`,
})
class HostComponent {
  readonly value = signal<unknown>('something');
  readonly disabled = signal(false);
  clearedCount = 0;

  onCleared(): void {
    this.clearedCount++;
  }
}

describe('EscClearableDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  function pressEscape(): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event;
  }

  it('emits cleared and stops propagation when the field has a value', () => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

    input.dispatchEvent(event);

    expect(fixture.componentInstance.clearedCount).toBe(1);
    expect(stopPropagationSpy).toHaveBeenCalled();
  });

  it('does nothing when the field is empty', () => {
    fixture.componentInstance.value.set('');
    fixture.detectChanges();

    pressEscape();

    expect(fixture.componentInstance.clearedCount).toBe(0);
  });

  it('does nothing when the field value is null', () => {
    fixture.componentInstance.value.set(null);
    fixture.detectChanges();

    pressEscape();

    expect(fixture.componentInstance.clearedCount).toBe(0);
  });

  it('does nothing when disabled, even with a value', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    pressEscape();

    expect(fixture.componentInstance.clearedCount).toBe(0);
  });
});
