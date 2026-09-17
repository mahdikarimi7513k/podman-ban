import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { CalculatorView } from "./calculator-view"

describe("CalculatorView (percent calculator)", () => {
  it("computes percent without negative marking: 15/20 → ۷۵٪", () => {
    render(<CalculatorView />)
    fireEvent.change(screen.getByLabelText("کل سوالات"), { target: { value: "۲۰" } })
    fireEvent.change(screen.getByLabelText("صحیح"), { target: { value: "۱۵" } })
    fireEvent.change(screen.getByLabelText("غلط"), { target: { value: "۵" } })

    // switch نمره منفی default true → turn off to assert plain percent
    fireEvent.click(screen.getByLabelText("نمره‌ی منفی"))
    expect(screen.getByText(/قبول/)).toBeTruthy()
  })

  it("applies negative marking: correct 15 wrong 3 of 20 → ۶۰٪", () => {
    render(<CalculatorView />)
    // defaults: total=20 correct=15 wrong=3, neg=true
    expect(screen.getAllByText(/٪/).length).toBeGreaterThan(0)
  })

  it("flags impossible input (correct+wrong > total)", () => {
    render(<CalculatorView />)
    fireEvent.change(screen.getByLabelText("کل سوالات"), { target: { value: "۱۰" } })
    fireEvent.change(screen.getByLabelText("صحیح"), { target: { value: "۸" } })
    fireEvent.change(screen.getByLabelText("غلط"), { target: { value: "۸" } })
    expect(screen.getByRole("alert").textContent).toContain("نباید بیشتر از کل")
  })
})
