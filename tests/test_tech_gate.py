"""Tests for is_non_tech_title() — the pre-LLM filter that skips non-tech roles."""

import pytest

from agents.prompt_utils import is_non_tech_title


class TestNonTechTitles:
    @pytest.mark.parametrize(
        "title",
        [
            "Paralegal",
            "Senior Paralegal",
            "Parajuriste",
            "Legal Counsel",
            "Conseillère juridique",
            "Avocat",
            "Avocate corporative",
            "Notary",
            "Notaire",
            "Recruiter",
            "Recruteur",
            "Talent Acquisition Specialist",
            "Human Resources Manager",
            "HR Generalist",
            "HR Business Partner",
            "Marketing Coordinator",
            "Marketing Manager",
            "Marketing Specialist",
            "Coordonnateur Marketing",
            "Sales Representative",
            "Sales Account Executive",
            "Account Executive",
            "Account Manager",
            "Représentant des ventes",
            "Finance Manager",
            "Finance Analyst",
            "Accountant",
            "Comptable",
            "Controller",
            "Bookkeeper",
            "Administrative Assistant",
            "Receptionist",
            "Réceptionniste",
        ],
    )
    def test_non_tech_titles_are_gated(self, title):
        assert is_non_tech_title(title) is True, f"Expected '{title}' to be gated"

    @pytest.mark.parametrize(
        "title",
        [
            "Senior Backend Engineer",
            "Software Developer",
            "Data Engineer",
            "ML Engineer",
            "Frontend Engineer",
            "Full Stack Developer",
            "DevOps Engineer",
            "Platform Engineer",
            "Python Developer",
            "Développeur Full Stack",
            "Data Analyst",
            "Cloud Architect",
            "QA Engineer",
            "Site Reliability Engineer",
            "Mobile Developer",
            "Ingénieur logiciel",
            "Tech Lead",
            "CTO",
            "Engineering Manager",
            "Product Manager",
            "Product Designer",
        ],
    )
    def test_tech_titles_pass_through(self, title):
        assert is_non_tech_title(title) is False, f"Expected '{title}' to pass through"

    def test_case_insensitive(self):
        assert is_non_tech_title("PARALEGAL") is True
        assert is_non_tech_title("paralegal") is True
        assert is_non_tech_title("Paralegal") is True

    def test_partial_match_in_longer_title(self):
        # "Sales" in a tech-adjacent title should still gate
        assert is_non_tech_title("Sales Account Executive, Mid-Market") is True

    def test_empty_string(self):
        assert is_non_tech_title("") is False
