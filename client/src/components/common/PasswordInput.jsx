import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons';

/**
 * Password box with an eye button that shows or hides what was typed.
 * Accepts every prop a normal <input> takes (value, onChange, placeholder, ...).
 */
export default function PasswordInput({ id, value, onChange, placeholder, autoComplete = 'new-password', required = false, disabled = false, minLength }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-wrap">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        minLength={minLength}
      />
      <button
        type="button"
        className="pw-toggle"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        title={visible ? 'Hide password' : 'Show password'}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon width={16} height={16} /> : <EyeIcon width={16} height={16} />}
      </button>
    </div>
  );
}
