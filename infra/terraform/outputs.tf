output "function_url" {
  description = "The Lambda Function URL — POST {\"resume_text\": \"...\"} to it"
  value       = aws_lambda_function_url.fit_scorer.function_url
}

output "ecr_repository_url" {
  description = "Push images here: docker push <this>:<tag>"
  value       = aws_ecr_repository.fit_scorer.repository_url
}

output "lambda_function_name" {
  value = aws_lambda_function.fit_scorer.function_name
}
