/**
 * Smoke test to verify vitest infrastructure is working.
 * This test will be removed once real tests are added.
 */
describe('vitest setup', () => {
  it('should run tests', () => {
    expect(true).toBe(true)
  })

  it('should have jest-dom matchers available', () => {
    const element = document.createElement('div')
    element.textContent = 'hello'
    document.body.appendChild(element)
    expect(element).toBeInTheDocument()
    document.body.removeChild(element)
  })
})
