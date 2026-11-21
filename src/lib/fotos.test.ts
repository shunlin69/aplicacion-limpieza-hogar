import { describe, expect, it } from 'vitest'
import { complaintPhotoPath, fitSize, photoPath } from './fotos'

describe('fotos de respaldo', () => {
  it('achica la foto manteniendo la proporción', () => {
    expect(fitSize(4032, 3024)).toEqual({ w: 1600, h: 1200 }) // iPhone horizontal
    expect(fitSize(3024, 4032)).toEqual({ w: 1200, h: 1600 }) // iPhone vertical
  })

  it('no agranda fotos chicas', () => {
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 })
  })

  it('nunca deja un lado en cero', () => {
    expect(fitSize(10000, 2)).toEqual({ w: 1600, h: 1 })
  })

  it('guarda cada foto en la carpeta de su hogar y su turno', () => {
    expect(photoPath('h1', 't1', 'f1')).toBe('h1/t1/f1.jpg')
  })

  it('las fotos de una queja van en la carpeta quejas de su hogar', () => {
    expect(complaintPhotoPath('h1', 'q1', 'f1')).toBe('h1/quejas/q1/f1.jpg')
  })
})
