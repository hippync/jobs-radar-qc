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
            # French media/marketing (Quebec patterns — regression for Valtech job)
            "Gestionnaire des Médias de Performance",
            "Gestionnaire de Médias Sociaux",
            "Responsable Marketing",
            "Responsable Communication",
            "Responsable Contenu",
            "Responsable Médias",
            "Spécialiste Marketing",
            "Spécialiste Médias",
            "Spécialiste Publicité",
            "Directeur Marketing",
            "Directrice Médias",
            "Directeur Communication",
            "Acheteur Médias",
            "Planificatrice Médias",
            # English media (not covered by marketing\s+... pattern)
            "Media Manager",
            "Media Buyer",
            "Media Planner",
            "Media Specialist",
            "Media Strategist",
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
            # Healthcare / academia (Quebec Workday employers — regression for
            # McGill and Desjardins/AtkinsRéalis leakage reported in the UX backlog)
            "Nursing Teaching Assistant",
            "Nurse",
            "Infirmière",
            "Pharmacist",
            "Teaching Assistant",
            "Professor",
            "Professeure",
            "Lecturer",
            "Chargé de cours",
            "Librarian",
            "Bibliothécaire",
            # Non-software engineering disciplines (AtkinsRéalis)
            "Structural Engineer",
            "Civil Engineer",
            "Environmental Engineer",
            "Geotechnical Engineer",
            "Ingénieure civile",
            "Ingénieur en structure",
            # Finance / wealth / insurance (Desjardins, Intact, PSP Investments)
            "Wealth Advisor",
            "Financial Advisor",
            "Investment Advisor",
            "Insurance Advisor",
            "Portfolio Manager",
            "Investment Analyst",
            "Conseillère en gestion de patrimoine",
            "Actuary",
            "Underwriter",
            "Claims Adjuster",
            "Branch Manager",
            "Teller",
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
            "Gestionnaire d'infrastructure",
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
