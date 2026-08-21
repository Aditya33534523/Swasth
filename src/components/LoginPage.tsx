import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Heart,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  Phone,
  ArrowRight,
  Check,
  Smartphone,
  Apple,
  Shield,
} from 'lucide-react';
import { register, login } from '../lib/auth';
import { logActivity } from '../lib/storage';
import type { User } from '../types';

interface LoginPageProps {
  onAuth: (user: User) => void;
}

const IconField: React.FC<{
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, children }) => (
  <div className="relative flex items-center">
    <span className="login-field-icon">{icon}</span>
    {children}
  </div>
);

export const LoginPage: React.FC<LoginPageProps> = ({ onAuth }) => {
  const shouldReduceMotion = useReducedMotion();

  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotNote, setShowForgotNote] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const switchMode = (toRegister: boolean) => {
    setIsRegister(toRegister);
    setError('');
    setShowForgotNote(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      let result: User | string;

      if (isRegister) {
        result = register(name, email, phone, password);
      } else {
        result = login(email, password);
      }

      if (typeof result === 'string') {
        setError(result);
        setLoading(false);
      } else {
        logActivity(isRegister ? 'register' : 'login', result.email);
        onAuth(result);
      }
    }, 400);
  };

  const inputProps = {
    className: 'login-glass-input',
    required: true,
  };

  return (
    <div className="login-page">
      {/* ───────── Background atmosphere ───────── */}
      <div className="login-atmosphere" />

      {/* ───────── Top bar ───────── */}
      <header className="login-topbar">
        <div className="login-brand">
          <div className="login-traffic-lights" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="login-brand-icon">
            <Heart size={22} strokeWidth={1.8} />
          </div>

          <span>SwasthSetu</span>
        </div>
      </header>

      {/* ───────── Main composition ───────── */}
      <main className="login-layout">

        {/* Left editorial text */}
        <motion.section
          className="login-left-copy"
          initial={shouldReduceMotion ? {} : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <div className="login-eyebrow">SWASTHSETU</div>

          <h2>
            Better
            <br />
            Health,
            <br />
            <em>Together.</em>
          </h2>

          <div className="login-copy-line" />

          <p>Accessible&nbsp;&nbsp;•&nbsp;&nbsp; Smart&nbsp;&nbsp;•&nbsp;&nbsp; Caring</p>
        </motion.section>

        {/* ───────── Main glass card ───────── */}
        <motion.section
          className="login-main-glass"
          initial={shouldReduceMotion ? {} : { opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 26,
          }}
        >
          {/* glossy highlight */}
          <div className="login-glass-highlight" />

          {/* Logo */}
          <div className="login-main-logo">
            <div className="login-main-logo-inner">
              <Heart size={30} strokeWidth={1.5} />
              <span>+</span>
            </div>
          </div>

          <div className="login-title-block">
            <h1>SwasthSetu</h1>
            <p className="login-subtitle">Your AI Health Assistant</p>
            <p className="login-description">
              Find hospitals&nbsp;&nbsp;•&nbsp;&nbsp; Get health guidance&nbsp;&nbsp;•&nbsp;&nbsp; Learn about schemes
            </p>
          </div>

          {/* Sign In / Register */}
          <div className="login-tabs">
            <button
              type="button"
              onClick={() => switchMode(false)}
              className={!isRegister ? 'active' : ''}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => switchMode(true)}
              className={isRegister ? 'active' : ''}
            >
              Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">

            {isRegister && (
              <div className="login-form-group">
                <label htmlFor="login-name">Full Name</label>

                <IconField icon={<UserIcon size={18} />}>
                  <input
                    {...inputProps}
                    id="login-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Rahul Sharma"
                  />
                </IconField>
              </div>
            )}

            <div className="login-form-group">
              <label htmlFor="login-email">Email</label>

              <IconField icon={<Mail size={18} />}>
                <input
                  {...inputProps}
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rahul@example.com"
                />
              </IconField>
            </div>

            {isRegister && (
              <div className="login-form-group">
                <label htmlFor="login-phone">Phone Number</label>

                <IconField icon={<Phone size={18} />}>
                  <input
                    {...inputProps}
                    id="login-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) =>
                      setPhone(
                        e.target.value.replace(/\D/g, '').slice(0, 10),
                      )
                    }
                    placeholder="9876543210"
                  />
                </IconField>
              </div>
            )}

            <div className="login-form-group">
              <label htmlFor="login-password">Password</label>

              <IconField icon={<Lock size={18} />}>
                <input
                  {...inputProps}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  style={{ paddingRight: 48 }}
                />

                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </IconField>
            </div>

            {error && (
              <motion.p
                className="login-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.p>
            )}

            {/* Remember / Forgot */}
            {!isRegister && (
              <div className="login-options">
                <button
                  type="button"
                  className="remember-button"
                  onClick={() => setRememberMe((v) => !v)}
                >
                  <span className={rememberMe ? 'checked' : ''}>
                    {rememberMe && <Check size={12} strokeWidth={3} />}
                  </span>
                  Remember me
                </button>

                <button
                  type="button"
                  className="forgot-button"
                  onClick={() => setShowForgotNote((v) => !v)}
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {showForgotNote && !isRegister && (
              <p className="login-forgot-note">
                Password recovery isn't available in this demo — please
                register a new account if you've forgotten yours.
              </p>
            )}

            {/* Primary button */}
            <button
              type="submit"
              disabled={loading}
              className="login-submit"
            >
              <span>
                {loading
                  ? 'Please wait…'
                  : isRegister
                    ? 'Create Account'
                    : 'Sign In'}
              </span>

              {!loading && <ArrowRight size={19} />}
            </button>
          </form>

          {/* Divider */}
          <div className="login-divider">
            <span />
            <b>or</b>
            <span />
          </div>

          {/* Social visual buttons */}
          <div className="login-socials">
            <button type="button" aria-label="Google login">
              <span className="google-g">G</span>
            </button>

            <button type="button" aria-label="Apple login">
              <Apple size={20} />
            </button>

            <button type="button" aria-label="Phone login">
              <Smartphone size={20} />
            </button>
          </div>

          {/* Footer */}
          <p className="login-footer">
            {isRegister
              ? 'Already have an account?'
              : 'New to SwasthSetu?'}{' '}

            <button
              type="button"
              onClick={() => switchMode(!isRegister)}
            >
              {isRegister ? 'Sign in' : 'Create Account'}
              <ArrowRight size={14} />
            </button>
          </p>
        </motion.section>
      </main>

      {/* Emergency */}
      <a href="tel:108" className="login-emergency">
        <span className="emergency-icon">
          <Phone size={20} fill="currentColor" />
        </span>

        <span>
          <small>Emergency?</small>
          <strong>Call 108</strong>
        </span>
      </a>

      {/* Privacy */}
      <div className="login-privacy">
        <Shield size={15} />
        <span>Your data is private &amp; secure</span>
      </div>
    </div>
  );
};