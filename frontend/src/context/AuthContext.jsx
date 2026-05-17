import React, { createContext, useState, useContext, useEffect } from 'react'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('access_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      // Verify token is still valid
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          setUser(data)
        })
        .catch(() => {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = async (username, password) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)

    const response = await fetch('/api/auth/token', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) throw new Error('Login failed')
    
    const data = await response.json()
    localStorage.setItem('access_token', data.access_token)
    if (data.refresh_token) {
      localStorage.setItem('refresh_token', data.refresh_token)
    }
    setToken(data.access_token)
    return data
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setToken(null)
    setUser(null)
  }

  const register = async (username, email, password, department = null) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, department })
    })
    
    if (!response.ok) throw new Error('Registration failed')
    return response.json()
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
