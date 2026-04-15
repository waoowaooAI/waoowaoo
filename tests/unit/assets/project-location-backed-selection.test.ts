import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteObjectMock = vi.hoisted(() => vi.fn())
const resolveStorageKeyFromMediaValueMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  projectLocation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  locationImage: {
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/storage', () => ({
  deleteObject: deleteObjectMock,
}))

vi.mock('@/lib/media/service', () => ({
  resolveStorageKeyFromMediaValue: resolveStorageKeyFromMediaValueMock,
}))

describe('project location-backed selection service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (
      callback: (tx: {
        locationImage: {
          update: typeof prismaMock.locationImage.update
          deleteMany: typeof prismaMock.locationImage.deleteMany
        }
        projectLocation: {
          update: typeof prismaMock.projectLocation.update
        }
      }) => Promise<void>,
    ) => callback({
      locationImage: prismaMock.locationImage,
      projectLocation: prismaMock.projectLocation,
    }))
    resolveStorageKeyFromMediaValueMock.mockImplementation(async (value: string) => `key:${value}`)
    deleteObjectMock.mockResolvedValue(undefined)
    prismaMock.locationImage.deleteMany.mockResolvedValue({ count: 1 })
    prismaMock.locationImage.update.mockResolvedValue(undefined)
    prismaMock.projectLocation.update.mockResolvedValue(undefined)
  })

  it('confirms a prop selection by keeping only the selected render', async () => {
    prismaMock.projectLocation.findUnique.mockResolvedValue({
      id: 'prop-1',
      selectedImageId: 'prop-image-2',
      images: [
        {
          id: 'prop-image-1',
          imageIndex: 0,
          imageUrl: 'https://example.com/prop-1.png',
          isSelected: false,
        },
        {
          id: 'prop-image-2',
          imageIndex: 1,
          imageUrl: 'https://example.com/prop-2.png',
          isSelected: true,
        },
      ],
    })

    const mod = await import('@/lib/assets/services/project-location-backed-selection')

    const result = await mod.confirmProjectLocationBackedSelection('prop-1')

    expect(result).toEqual({ success: true })
    expect(resolveStorageKeyFromMediaValueMock).toHaveBeenCalledWith('https://example.com/prop-1.png')
    expect(deleteObjectMock).toHaveBeenCalledWith('key:https://example.com/prop-1.png')
    expect(prismaMock.locationImage.deleteMany).toHaveBeenCalledWith({
      where: {
        locationId: 'prop-1',
        id: { not: 'prop-image-2' },
      },
    })
    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { id: 'prop-image-2' },
      data: {
        imageIndex: 0,
        isSelected: true,
      },
    })
    expect(prismaMock.projectLocation.update).toHaveBeenCalledWith({
      where: { id: 'prop-1' },
      data: { selectedImageId: 'prop-image-2' },
    })
  })

  it('fails explicitly when confirming without a selected prop render', async () => {
    prismaMock.projectLocation.findUnique.mockResolvedValue({
      id: 'prop-1',
      selectedImageId: null,
      images: [
        {
          id: 'prop-image-1',
          imageIndex: 0,
          imageUrl: 'https://example.com/prop-1.png',
          isSelected: false,
        },
        {
          id: 'prop-image-2',
          imageIndex: 1,
          imageUrl: 'https://example.com/prop-2.png',
          isSelected: false,
        },
      ],
    })

    const mod = await import('@/lib/assets/services/project-location-backed-selection')

    await expect(mod.confirmProjectLocationBackedSelection('prop-1')).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
    })
    expect(prismaMock.locationImage.deleteMany).not.toHaveBeenCalled()
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })
})
