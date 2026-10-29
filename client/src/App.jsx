import { useState } from 'react'
import './App.css'
import professionalWorkers from './assets/professional-workers.svg'
import Dashboard from './Dashboard'

const services = [
  {
    number: '01',
    title: 'Find Skilled Workers',
    description:
      'Discover reliable local professionals for everyday tasks, home services, and skilled work.',
    action: 'Find a worker',
    icon: '✦',
  },
  {
    number: '02',
    title: 'Discover Work',
    description:
      'Explore suitable job opportunities, connect with customers, and grow your work profile.',
    action: 'Explore jobs',
    icon: '↗',
  },
  {
    number: '03',
    title: 'Build Trust',
    description:
      'Create a trusted work community with clear job details, transparent records, and reviews.',
    action: 'Learn about trust',
    icon: '✓',
  },
]

function App() {
  const [authPage, setAuthPage] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('customer')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [signedInUser, setSignedInUser] = useState(() => {
    try {
      const saved = localStorage.getItem('nithyaseva_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  function openAuth(page) {
    setAuthPage(page)
    setNotice('')
    setError('')
    setPassword('')
    setShowPassword(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    const endpoint = authPage === 'register' ? 'register' : 'login'
    const payload = authPage === 'register'
      ? { fullName, email, phone, password, role }
      : { email, password, role }

    try {
      const response = await fetch(`http://localhost:5000/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Something went wrong. Please try again.')
      }

      localStorage.setItem('nithyaseva_token', data.token)
      localStorage.setItem('nithyaseva_user', JSON.stringify(data.user))
      setSignedInUser(data.user)
      setAuthPage('')
      setNotice('')
      setPassword('')
      setShowPassword(false)
    } catch (requestError) {
      setError(requestError.message || 'Could not connect to the server. Make sure the NithyaSeva backend is running.')
    } finally {
      setBusy(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('nithyaseva_token')
    localStorage.removeItem('nithyaseva_user')
    setSignedInUser(null)
    setNotice('')
    setError('')
    setAuthPage('')
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="NithyaSeva home" onClick={() => setAuthPage('')}>
          <span className="brand-mark">N</span>
          <span>Nithya<span className="brand-accent">Seva</span></span>
        </a>
        <nav aria-label="Main navigation">
          <a className={`nav-link ${!authPage ? 'active' : ''}`} href="#home" onClick={() => setAuthPage('')}>Home</a>
          <a className="nav-link" href="#services" onClick={() => setAuthPage('')}>Services</a>
          <a className="nav-link" href="#about" onClick={() => setAuthPage('')}>About us</a>
          {signedInUser && (
            <>
              <span className="nav-user">Hi, {signedInUser.full_name}</span>
              <button className="nav-login" type="button" onClick={handleLogout}>Log out</button>
            </>
          )}
        </nav>
      </header>

      {authPage ? (
        <section className="auth-section" aria-labelledby="auth-title">
          <div className="auth-decoration">
            <p className="eyebrow"><span className="eyebrow-dot" /> OPPORTUNITY. DIGNITY. GROWTH.</p>
            <h1>{authPage === 'register' ? <>Join a community<br />that values <span>your work.</span></> : <>Welcome back<br />to <span>NithyaSeva.</span></>}</h1>
            <p>{authPage === 'register'
              ? 'Create an account to find trusted services or discover meaningful work opportunities.'
              : 'Log in to continue your journey with the NithyaSeva community.'}</p>
            <img src={professionalWorkers} alt="NithyaSeva service tools illustration" />
          </div>
          <div className="auth-card">
            <p className="eyebrow">{authPage === 'register' ? 'GET STARTED' : 'YOUR ACCOUNT'}</p>
            <h2 id="auth-title">{authPage === 'register' ? 'Create your account' : 'Log in'}</h2>
            <p className="auth-subtitle">{authPage === 'register' ? 'A few details to get you started.' : 'Enter your details to access your account.'}</p>

            {notice && <div className="auth-message success-message" role="status">{notice}</div>}
            {error && <div className="auth-message error-message" role="alert">{error}</div>}

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authPage === 'register' && <>
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" name="fullName" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} maxLength={120} required placeholder="Enter your full name" />
              </>}
              <label htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255} required placeholder="you@example.com" />
              {authPage === 'register' && <>
                <label htmlFor="phone">Phone number <span className="optional-label">(optional)</span></label>
                <input id="phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter your phone number" />
              </>}
              <label htmlFor="role">{authPage === 'register' ? 'Account type' : 'Log in as'}</label>
              <div className="account-type-options" role="group" aria-label="Choose account type">
                <button
                  className={`account-type-option ${role === 'customer' ? 'selected' : ''}`}
                  type="button"
                  aria-pressed={role === 'customer'}
                  onClick={() => setRole('customer')}
                >
                  <span className="account-type-title">Customer</span>
                  <span className="account-type-description">Find skilled workers</span>
                </button>
                <button
                  className={`account-type-option ${role === 'worker' ? 'selected' : ''}`}
                  type="button"
                  aria-pressed={role === 'worker'}
                  onClick={() => setRole('worker')}
                >
                  <span className="account-type-title">Worker</span>
                  <span className="account-type-description">Find job opportunities</span>
                </button>
              </div>
              <label htmlFor="password">Password</label>
              <div className="password-input-wrap">
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={authPage === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={authPage === 'register' ? 8 : undefined} maxLength={72} required placeholder={authPage === 'register' ? 'At least 8 characters' : 'Enter your password'} />
                <button className="password-toggle" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
              </div>
              <label className="show-password-option">
                <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />
                Show password
              </label>
              <button className="auth-submit" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : authPage === 'register' ? 'Create account' : 'Log in'} <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="auth-switch">
              {authPage === 'register' ? 'Already have an account?' : 'New to NithyaSeva?'}{' '}
              <button type="button" onClick={() => openAuth(authPage === 'register' ? 'login' : 'register')}>
                {authPage === 'register' ? 'Log in' : 'Create an account'}
              </button>
            </p>
            <button className="back-home" type="button" onClick={() => { setAuthPage(''); setError(''); setNotice('') }}>← Back to homepage</button>
          </div>
        </section>
      ) : signedInUser ? (
        <Dashboard user={signedInUser} onLogout={handleLogout} />
      ) : (
        <>
          <section className="hero" id="home">
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-dot" /> OPPORTUNITY. DIGNITY. GROWTH.</p>
              <h1>Good work deserves<br />a <span>better future.</span></h1>
              <p className="hero-description">
                Connecting skilled workers with meaningful opportunities through trust,
                transparency, and a community that values every skill.
              </p>
              <div className="hero-actions">
                <button className="primary-button" type="button" onClick={() => openAuth('register')}>Register <span aria-hidden="true">↗</span></button>
              <button className="primary-button" type="button" onClick={() => openAuth('login')}>Login <span aria-hidden="true">↗</span></button>
              </div>
              <div className="hero-note">
                <span className="note-check">✓</span>
                <span>Built for workers. Designed for a stronger community.</span>
              </div>
            </div>
            <div className="hero-art" aria-label="Professional service tools arranged in a floating composition">
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <div className="art-sun" />
              <div className="art-leaf leaf-one" />
              <div className="art-leaf leaf-two" />
              <img
                className="professional-workers-image"
                src={professionalWorkers}
                alt="Professional toolbox, maintenance tools, cleaning supplies, gloves, folded towels and a plant"
              />
            </div>
          </section>

          <section className="services-section" id="services">
            <div className="section-heading">
              <div><p className="eyebrow">A PLATFORM FOR EVERYONE</p><h2>One community.<br /><span>More possibilities.</span></h2></div>
              <p className="section-intro">Whether you need a helping hand or are looking for your next opportunity, NithyaSeva brings people and possibilities together.</p>
            </div>
            <div className="service-grid">
              {services.map((service) => (
                <article className="service-card" key={service.number}>
                  <div className="service-card-top"><span className="service-icon">{service.icon}</span><span className="service-number">{service.number}</span></div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <button type="button" onClick={() => openAuth(service.number === '02' ? 'register' : 'login')} className="service-link">{service.action} <span aria-hidden="true">→</span></button>
                </article>
              ))}
            </div>
          </section>

          <section className="mission-section" id="about">
            <div className="mission-symbol" aria-hidden="true"><span>✳</span></div>
            <div><p className="eyebrow">OUR PURPOSE</p><h2>Work with dignity.<br /><span>Grow with confidence.</span></h2></div>
            <p className="mission-copy">NithyaSeva is building a more connected, dependable, and empowering service marketplace—where people can find work, access opportunities, and build trust through every interaction.</p>
          </section>
        </>
      )}

      <footer className="site-footer">
        <a className="brand footer-brand" href="#home" onClick={() => setAuthPage('')}><span className="brand-mark">N</span><span>Nithya<span className="brand-accent">Seva</span></span></a>
        <p>Every skill has value. Every worker deserves opportunity.</p>
        <span className="footer-copy">© {new Date().getFullYear()} NithyaSeva</span>
      </footer>
    </main>
  )
}

export default App
