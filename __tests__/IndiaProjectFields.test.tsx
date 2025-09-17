import { render, screen, fireEvent } from '@testing-library/react'
import IndiaProjectFields from '@/components/projects/IndiaProjectFields'

describe('IndiaProjectFields', () => {
  it('renders genre chips and toggles selection', () => {
    render(<IndiaProjectFields />)
    // Expect a few known chips to be present
    const drama = screen.getByText('Bollywood Drama')
    expect(drama).toBeInTheDocument()
    // Toggle
    fireEvent.click(drama)
    // Hidden input should be created for selected genre
    const hiddenInputs = document.querySelectorAll('input[name="genre"]')
    expect(hiddenInputs.length).toBeGreaterThan(0)
  })
})

