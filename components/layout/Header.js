// File: components/layout/Header.js
import Link from 'next/link';
import Image from 'next/image';

const Header = () => {
  return (
    <header style={headerStyle}>
      <div style={logoContainerStyle}>
        <Link href="/" passHref legacyBehavior>
          <a style={logoLinkStyle}>
            <Image
              // Using a reliable placeholder URL directly for now
              src="https://placehold.co/150x40/4A90E2/FFFFFF?text=Platform+Logo&font=montserrat"
              // If your local image is fixed, change src back to "/placeholder-logo.png"
              // src="/placeholder-logo.png"
              alt="Platform Logo"
              width={150}
              height={40}
              // Optional: If you want to be very specific about how it handles dimensions
              // layout="fixed" // or "intrinsic"
              onError={(e) => {
                // This fallback will only work if the initial src fails.
                // If the initial src IS the placehold.co URL and it fails, this won't re-trigger for the same URL.
                e.target.onerror = null; // Prevents infinite loop if fallback also fails
                e.target.src = "https://placehold.co/150x40/CCCCCC/4A4A4A?text=Logo+Error&font=montserrat";
              }}
            />
          </a>
        </Link>
      </div>
      <div style={userProfileNotificationsStyle}>
        <span style={navItemStyle}>Notifications 🔔</span>
        <span style={navItemStyle}>User Profile 👤</span>
      </div>
    </header>
  );
};

const headerStyle = {
  height: 'var(--header-height)',
  backgroundColor: '#FFFFFF',
  borderBottom: '1px solid var(--border-color)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 24px',
  position: 'sticky',
  top: 0,
  zIndex: 1000,
  flexShrink: 0,
};

const logoContainerStyle = {
  display: 'flex',
  alignItems: 'center',
};

const logoLinkStyle = {
  display: 'flex',
  alignItems: 'center',
  textDecoration: 'none',
};

const userProfileNotificationsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
};

const navItemStyle = {
  fontSize: '14px',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

export default Header;
