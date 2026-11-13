// Project and team details shown on the landing page. Edit them here; nothing else needs to change.

export const project = {
  title: 'E-Ticket Booking Platform',
  kind: 'DBMS Mini-Project',
  tagline:
    'Browse events, pick your seats, pay, and get QR-coded e-tickets, backed by a MySQL database that makes it impossible to sell the same seat twice.',
  college: 'University of Visvesvaraya College of Engineering',
  department: 'Department of Computer Science and Engineering',
  place: 'K.R. Circle, Bengaluru',
  className: 'V Semester B.Tech, CSE',
  year: 'Academic year 2026–27',
  session: '2026–27',
}

export const team = [
  { name: 'Anish Dev Edward', usn: 'U25UV24T029013' },
  { name: 'Agastya S Raju', usn: 'U25UV24T029005' },
]

export const guide = {
  name: 'Dr. Samyama Gunjal G\u00A0H', // non-breaking space keeps the initials together
  role: 'Associate Professor, Department of CSE, UVCE',
}

// What the database layer contains (from backend/sql/01_schema.sql and 02_programmability.sql)
export const dbFacts = [
  { n: 9, label: 'tables' },
  { n: 8, label: 'triggers' },
  { n: 4, label: 'views' },
  { n: 3, label: 'stored procedures' },
]
