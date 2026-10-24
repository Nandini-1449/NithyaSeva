import { useCallback, useEffect, useState } from 'react'
import './Dashboard.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export default function Dashboard({ user, onLogout }) {
  const [section, setSection] = useState(user.role === 'worker' ? 'jobs' : 'workers')
  const [workers, setWorkers] = useState([])
  const [jobs, setJobs] = useState([])
  const [mine, setMine] = useState([])
  const [profile, setProfile] = useState({ bio: '', skills: [], experienceYears: 0, serviceArea: '', hourlyRate: '', availabilityStatus: 'available' })
  const [applications, setApplications] = useState({})
  const [notifications, setNotifications] = useState([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [jobForm, setJobForm] = useState({ title: '', description: '', category: 'Home services', serviceLocation: '', budget: '' })
  const [applyForm, setApplyForm] = useState({ jobId: '', proposedPrice: '', message: '' })

  const request = useCallback(async (path, options = {}) => {
    const token = localStorage.getItem('nithyaseva_token')
    const response = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(options.headers || {}) },
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      localStorage.removeItem('nithyaseva_token')
      localStorage.removeItem('nithyaseva_user')
      onLogout()
      throw new Error('Your session expired. Please log in again.')
    }
    if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed. Please try again.')
    return data
  }, [onLogout])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const tasks = [request('/jobs?status=open'), request('/notifications')]
      if (user.role === 'customer') tasks.push(request('/workers'), request('/jobs/mine'))
      if (user.role === 'worker') tasks.push(request('/workers/me'))
      const values = await Promise.all(tasks)
      setJobs(values[0].jobs || [])
      setNotifications(values[1].notifications || [])
      if (user.role === 'customer') { setWorkers(values[2].workers || []); setMine(values[3].jobs || []) }
      if (user.role === 'worker') {
        const p = values[2].profile
        setProfile({ bio: p.bio || '', skills: p.skills || [], experienceYears: p.experience_years || 0, serviceArea: p.service_area || '', hourlyRate: p.hourly_rate ?? '', availabilityStatus: p.availability_status || 'available' })
      }
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [request, user.role])

  useEffect(() => { load() }, [load])

  async function act(fn, successText) {
    setMessage(''); setError('')
    try {
      await fn()
      setMessage(successText)
      await load()
      return true
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.')
      return false
    }
  }

  async function createJob(e) {
    e.preventDefault()
    const posted = await act(
      () => request('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          ...jobForm,
          budget: jobForm.budget === '' ? null : Number(jobForm.budget),
        }),
      }),
      'Your job has been posted.'
    )
    if (!posted) return
    setJobForm({ title: '', description: '', category: 'Home services', serviceLocation: '', budget: '' })
    setSection('myjobs')
  }

  async function apply(jobId) {
    const price = window.prompt('Your proposed price in INR (leave blank to use the customer budget):', '')
    if (price === null) return
    const note = window.prompt('Short message to the customer (optional):', '') || ''
    await act(() => request('/jobs/' + jobId + '/applications', { method: 'POST', body: JSON.stringify({ proposedPrice: price.trim() ? Number(price) : null, message: note }) }), 'Your application has been sent.')
  }

  async function showApplications(jobId) {
    setError(''); setMessage('')
    try {
      const data = await request('/jobs/' + jobId + '/applications')
      setApplications(prev => ({ ...prev, [jobId]: data.applications || [] }))
      setSection('applications')
    } catch (e) { setError(e.message) }
  }

  async function accept(jobId, applicationId) {
    await act(() => request('/jobs/' + jobId + '/applications/' + applicationId + '/accept', { method: 'POST', body: '{}' }), 'Worker selected and agreement created.')
  }

  async function changeStatus(jobId, status) {
    await act(() => request('/jobs/' + jobId + '/status', { method: 'PATCH', body: JSON.stringify({ status }) }), 'Job status updated.')
  }

  async function saveProfile(e) {
    e.preventDefault()
    await act(() => request('/workers/me', { method: 'PUT', body: JSON.stringify({ ...profile, skills: Array.isArray(profile.skills) ? profile.skills : String(profile.skills).split(',').map(s => s.trim()).filter(Boolean), experienceYears: Number(profile.experienceYears), hourlyRate: profile.hourlyRate === '' ? null : Number(profile.hourlyRate) }) }), 'Worker profile saved.')
  }

  async function markRead(id) {
    await act(() => request('/notifications/' + id + '/read', { method: 'PATCH', body: '{}' }), 'Notification marked as read.')
  }

  const money = value => value === null || value === undefined || value === '' ? 'Negotiable' : '₹' + Number(value).toLocaleString('en-IN')
  const tabs = user.role === 'customer'
    ? [['workers', 'Find workers'], ['jobs', 'Open jobs'], ['post', 'Post a job'], ['myjobs', 'My jobs'], ['applications', 'Applications'], ['notifications', 'Notifications']]
    : [['jobs', 'Find jobs'], ['profile', 'My profile'], ['notifications', 'Notifications']]

  return <section className="dashboard">
    <div className="dashboard-heading">
      <div><p className="dash-eyebrow">YOUR NITHYASEVA WORKSPACE</p><h1>Hello, <span>{user.full_name?.split(' ')[0] || 'there'}</span></h1><p>Manage opportunities, work, and your account from one place.</p></div>
      <button className="dash-refresh" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh'}</button>
    </div>
    <div className="dash-tabs">{tabs.map(([id, label]) => <button key={id} className={section === id ? 'selected' : ''} onClick={() => setSection(id)}>{label}</button>)}</div>
    {message && <div className="dash-alert good" role="status">{message}</div>}
    {error && <div className="dash-alert bad" role="alert">{error}</div>}
    {loading && <p className="dash-muted">Loading your latest information…</p>}

    {section === 'workers' && user.role === 'customer' && <div className="dash-grid">{workers.filter(w => !search || (w.full_name + ' ' + (w.skills || []).join(' ') + ' ' + (w.service_area || '')).toLowerCase().includes(search.toLowerCase())).map(w => <article className="dash-card" key={w.id}><div className="dash-card-icon">✦</div><h3>{w.full_name}</h3><p>{w.bio || 'Skilled local service professional'}</p><p><b>Skills:</b> {(w.skills || []).join(', ') || 'Not added yet'}</p><p><b>Area:</b> {w.service_area || 'Not specified'}</p><p><b>Experience:</b> {w.experience_years || 0} years</p><p><b>Rate:</b> {money(w.hourly_rate)}</p><span className={'status-pill ' + (w.availability_status === 'available' ? 'available' : '')}>{w.availability_status || 'unavailable'}</span></article>)}{!workers.length && <Empty text="No worker profiles yet. Check back after workers complete their profiles." />}</div>}

    {section === 'jobs' && <div className="dash-grid">{jobs.filter(j => !search || (j.title + ' ' + j.description + ' ' + j.category).toLowerCase().includes(search.toLowerCase())).map(j => <article className="dash-card" key={j.id}><span className="status-pill">{j.status}</span><h3>{j.title}</h3><p>{j.description}</p><p><b>Category:</b> {j.category}</p><p><b>Location:</b> {j.service_location}</p><p><b>Budget:</b> {money(j.budget)}</p><p className="dash-muted">Posted by {j.customer_name || 'Customer'} · {new Date(j.created_at).toLocaleDateString()}</p>{user.role === 'worker' && <button className="dash-primary" onClick={() => apply(j.id)}>Apply for this job ↗</button>}</article>)}{!jobs.length && <Empty text="No open jobs at the moment. Please check back later." />}</div>}

    {section === 'post' && user.role === 'customer' && <form className="dash-form" onSubmit={createJob}><h2>Post a new job</h2><p>Describe the work clearly so workers can decide whether to apply.</p><label>Job title<input required maxLength="160" value={jobForm.title} onChange={e => setJobForm({ ...jobForm, title: e.target.value })} placeholder="e.g. Repair a leaking kitchen tap" /></label><label>Category<input required maxLength="100" value={jobForm.category} onChange={e => setJobForm({ ...jobForm, category: e.target.value })} /></label><label>Work description<textarea required maxLength="10000" rows="4" value={jobForm.description} onChange={e => setJobForm({ ...jobForm, description: e.target.value })} /></label><label>Service location<input required maxLength="1000" value={jobForm.serviceLocation} onChange={e => setJobForm({ ...jobForm, serviceLocation: e.target.value })} placeholder="Area or locality" /></label><label>Budget in INR (optional)<input type="number" min="0" step="0.01" value={jobForm.budget} onChange={e => setJobForm({ ...jobForm, budget: e.target.value })} /></label><button className="dash-primary" disabled={loading}>Publish job</button></form>}

    {section === 'myjobs' && user.role === 'customer' && <div className="dash-grid">{mine.map(j => <article className="dash-card" key={j.id}><span className="status-pill">{j.status}</span><h3>{j.title}</h3><p>{j.description}</p><p><b>Budget:</b> {money(j.budget)}</p><p><b>Location:</b> {j.service_location}</p><div className="dash-actions">{j.status === 'open' && <button className="dash-primary" onClick={() => showApplications(j.id)}>View applications</button>}{j.status === 'in_progress' && <button className="dash-primary" onClick={() => changeStatus(j.id, 'completed')}>Confirm completion</button>}{['open', 'assigned'].includes(j.status) && <button className="dash-secondary" onClick={() => changeStatus(j.id, 'cancelled')}>Cancel job</button>}</div></article>)}{!mine.length && <Empty text="You have not posted any jobs yet. Use “Post a job” to get started." />}</div>}

    {section === 'applications' && user.role === 'customer' && <div className="dash-grid">{Object.entries(applications).map(([jobId, list]) => <article className="dash-card" key={jobId}><h3>Job #{jobId}</h3>{list.map(a => <div className="application-row" key={a.id}><b>{a.worker_name}</b><p>{a.bio || 'Worker profile'} · {(a.skills || []).join(', ')}</p><p>Offer: {money(a.proposed_price)} · {a.experience_years || 0} years experience</p><p>{a.message || 'No message added.'}</p><span className="status-pill">{a.status}</span>{a.status === 'pending' && <button className="dash-primary" onClick={() => accept(jobId, a.id)}>Accept worker</button>}</div>)}</article>)}{!Object.keys(applications).length && <Empty text="Open “My jobs” and choose “View applications” to review applicants." />}</div>}

    {section === 'profile' && user.role === 'worker' && <form className="dash-form" onSubmit={saveProfile}><h2>Your worker profile</h2><p>A complete profile helps customers understand your experience and service area.</p><label>About you<textarea rows="4" maxLength="4000" value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></label><label>Skills (comma-separated)<input value={Array.isArray(profile.skills) ? profile.skills.join(', ') : profile.skills} onChange={e => setProfile({ ...profile, skills: e.target.value })} placeholder="Plumbing, cleaning, electrical work" /></label><label>Years of experience<input type="number" min="0" max="60" value={profile.experienceYears} onChange={e => setProfile({ ...profile, experienceYears: e.target.value })} /></label><label>Service area<input maxLength="160" value={profile.serviceArea} onChange={e => setProfile({ ...profile, serviceArea: e.target.value })} placeholder="Your locality or service area" /></label><label>Hourly rate in INR<input type="number" min="0" step="0.01" value={profile.hourlyRate} onChange={e => setProfile({ ...profile, hourlyRate: e.target.value })} /></label><label>Availability<select value={profile.availabilityStatus} onChange={e => setProfile({ ...profile, availabilityStatus: e.target.value })}><option value="available">Available for jobs</option><option value="busy">Busy</option><option value="unavailable">Unavailable</option></select></label><button className="dash-primary" disabled={loading}>Save profile</button></form>}

    {section === 'notifications' && <div className="dash-grid">{notifications.map(n => <article className="dash-card" key={n.id}><div className="notification-heading"><h3>{n.title}</h3>{!n.read_at && <span className="status-pill available">New</span>}</div><p>{n.message}</p><p className="dash-muted">{new Date(n.created_at).toLocaleString()}</p>{!n.read_at && <button className="dash-secondary" onClick={() => markRead(n.id)}>Mark as read</button>}</article>)}{!notifications.length && <Empty text="You’re all caught up. Notifications will appear here." />}</div>}
  </section>
}

function Empty({ text }) { return <div className="dash-empty"><span>✳</span><p>{text}</p></div> }
