import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

export const getFiles = async () => {
  const response = await axios.get(`${API_BASE_URL}/files`)
  return response.data
}

export const uploadFile = async (file) => {
  const formData = new FormData()
  formData.append('file', file)

  const response = await axios.post(`${API_BASE_URL}/files`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}

export const deleteFile = async (id) => {
  const response = await axios.delete(`${API_BASE_URL}/files/${id}`)
  return response.data
}

export const getDownloadUrl = async (id) => {
  const response = await axios.get(`${API_BASE_URL}/files/${id}/download`)
  return response.data
}