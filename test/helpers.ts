import { PERCENTAGE_SCALE } from 'constants/splits'
import { random, round, sum } from 'lodash'

// Takes a count and returns an array of evenly distributed random BigNumbers that sum to ALLOCATION_TOTAL
export function getRandomAllocations(count: number): number[] {
  const allocations = Array.from({ length: count }, () => Math.random())
  const totalAllocation = sum(allocations)
  const scaledAllocations = allocations.map((alloc) =>
    round((PERCENTAGE_SCALE.toNumber() * alloc) / totalAllocation),
  )
  // fix precision / rounding errors before converting to BN
  scaledAllocations[0] =
    PERCENTAGE_SCALE.toNumber() - sum(scaledAllocations.slice(1))
  if (scaledAllocations.some((alloc) => alloc === 0))
    return getRandomAllocations(count)
  return scaledAllocations
}

export function getRandomItem<T>(arr: T[]): T {
  return arr[random(arr.length - 1)]
}
