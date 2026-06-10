import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import AuthErrorAlert from './AuthErrorAlert';
import AuthPageShell from './AuthPageShell';
import AuthSubmitButton from './AuthSubmitButton';

describe('AuthPageShell', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the logo, tagline and children', () => {
    render(
      <AuthPageShell tagline="The home for your ideas">
        <p>Shell content</p>
      </AuthPageShell>,
    );

    expect(screen.getByAltText('daylog')).toBeInTheDocument();
    expect(screen.getByText('The home for your ideas')).toBeInTheDocument();
    expect(screen.getByText('Shell content')).toBeInTheDocument();
  });

  it('omits the tagline when not provided', () => {
    render(
      <AuthPageShell>
        <p>Shell content</p>
      </AuthPageShell>,
    );

    expect(screen.queryByText('The home for your ideas')).toBeNull();
  });

  it('wraps the logo in a link when logoHref is provided', () => {
    render(
      <AuthPageShell logoHref="/">
        <p>Shell content</p>
      </AuthPageShell>,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/');
  });
});

describe('AuthErrorAlert', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders the title and message', () => {
    render(<AuthErrorAlert title="Login failed" message="Bad credentials" />);

    expect(screen.getByText('Login failed')).toBeInTheDocument();
    expect(screen.getByText('Bad credentials')).toBeInTheDocument();
  });

  it('renders nothing without a message', () => {
    const { container } = render(<AuthErrorAlert title="Login failed" />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('AuthSubmitButton', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows the label when not pending', () => {
    render(
      <AuthSubmitButton pending={false} pendingLabel="Saving..." label="Save" />,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('shows the pending label and disables the button when pending', () => {
    render(
      <AuthSubmitButton pending={true} pendingLabel="Saving..." label="Save" />,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });
});
