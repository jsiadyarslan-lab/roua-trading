import { Twitter, Send, Youtube } from 'lucide-react';

const footerLinks = [
  { label: 'سياسة الخصوصية', href: '#' },
  { label: 'الشروط', href: '#' },
  { label: 'الأمان', href: '#' },
];

const socialLinks = [
  { icon: Twitter, href: '#', label: 'Twitter / X' },
  { icon: Send, href: '#', label: 'Telegram' },
  { icon: Youtube, href: '#', label: 'YouTube' },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span
              className="text-xl font-bold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              رؤى
            </span>
            <span className="text-white/20 text-xs font-medium">TRADING</span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6" dir="rtl">
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-white/40 text-sm hover:text-white/70 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Social Icons */}
          <div className="flex items-center gap-3">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                aria-label={social.label}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-200"
              >
                <social.icon size={16} strokeWidth={1.8} />
              </a>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-6 pt-4 border-t border-white/5 text-center">
          <p className="text-white/20 text-xs">
            © 2026 Roua Trading. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
